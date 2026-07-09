# ctx-autocompact

백그라운드에서 컨텍스트 사용량을 주기적으로 감시하다가, 임계치(기본 90%)에
도달하면 **pi-vcc** 압축을 선제적으로 실행하는 pi 확장.

## 동작 원리

- `session_start` 에서 `setInterval` 워치독을 시작 (기본 10초 주기).
- 매 tick 마다 `ctx.getContextUsage()` 로 `tokens / contextWindow` 사용률을 계산.
- `turn_end`, `message_end` 경계에서도 즉시 점검해 폴링 주기보다 빠르게 반응.
- 사용률 ≥ `thresholdPercent` 이면 `ctx.compact()` 를 호출.
  - `~/.pi/agent/pi-vcc-config.json` 의 `overrideDefaultCompaction: true` 덕분에
    **모든 압축 경로가 pi-vcc 의 알고리즘(LLM 미사용) 압축으로 처리**됩니다.
  - pi-vcc 는 **마지막 user 메시지 이후의 "kept tail"(=현재 작업 중인 내용)을 그대로 보존**하고
    그 이전의 과거 히스토리만 요약합니다. → 현재 작업은 압축되지 않음.
- `cooldownMs`(기본 60초) 디바운스로 연속 압축을 방지.
- 압축 효과가 미미하면(`minReclaimPercent` 미만 회수) **tail-bound** 로 판단해 보류 → 아래 참고.

## 왜 90% 선제 압축인가 (중단 없는 작업)

pi 가 자체적으로 압축하는 시점은 오버플로우 직전(overflow-recovery)이며, 이 경로는
진행 중이던 turn 을 **중단하고 재시도**합니다 — 이것이 실제 "끊김"입니다.
90% 에서 여유를 두고 미리 pi-vcc 로 압축하면 이 오버플로우 경로에 도달하지 않으므로
작업이 끊기지 않고 이어집니다.

## tail-bound 한계와 백오프 (`minReclaimPercent`)

pi-vcc 는 **마지막 user 메시지 이후의 tail 은 절대 압축하지 않습니다.** 따라서 한 번의
프롬프트로 시작된 긴 자율 실행에서 tool 출력이 대량 누적되면, 그 부피는 전부 tail 에 있어
압축해도 회수량이 거의 없습니다. (`ctx.compact()` 에는 keep 파라미터가 없어 tail 까지
압축하는 `keep:0` 도 불가능하며, 그렇게 하면 "현재 작업 보존" 요구가 깨지므로 의도적으로 안 함.)

이 헛수고 루프를 막기 위해, 압축이 끝나면 회수율을 계산합니다:

```
회수율(%) = (tokensBefore - estimatedTokensAfter) / tokensBefore × 100
```

- 회수율 **≥ `minReclaimPercent`** → 정상 압축. `X → ~Y tokens` 알림.
- 회수율 **< `minReclaimPercent`** → **tail-bound** 로 전환:
  - 자동 압축을 **다음 user 프롬프트까지 보류** (무의미한 반복 압축 차단)
  - 경고 한 번 (부피가 live turn 에 있으니 tool 출력은 context-mode 로 줄이라고 안내)
  - 푸터에 `ctx 92% ⚠tail` 표시
  - 다음 프롬프트(`before_agent_start`)가 오면 옛 실행이 압축 가능한 히스토리가 되므로 자동 해제.
    `/ctx-autocompact now` / `on` 으로도 강제 해제.

값을 높이면(예 `20`) 보수적으로 더 자주 보류, 낮추면(예 `1`) 공격적으로 계속 시도, `0` 이면
가드 사실상 비활성. **근본 해결은 tail 이 붓지 않게 하는 것** — context-mode 가 큰 tool 출력을
대화에서 빼주므로 이 상황 자체를 예방합니다.

## 압축 후 자동 재개 (`autoResume`)

compaction 이 끝나면 turn 이 종료되어 에이전트가 멈춥니다. 작업 도중(turn 진행 중)에
임계치를 넘겨 압축이 걸린 경우, 멈춘 채로 두지 않고 자동으로 이어서 진행시킵니다.

- 압축을 트리거할 때 `ctx.isIdle()` 로 **진행 중인 turn 을 끊었는지** 기록.
- 압축 완료(`onComplete`) 후 그 경우에만 `pi.sendUserMessage(resumePrompt, {deliverAs:"followUp"})` 로 재개.
- 가드: (1) 작업을 끊은 경우만, (2) 압축 후 실제로 idle 일 때만, (3) 이미 대기 중인 메시지가
  없을 때만 — 불필요한 turn 을 만들지 않습니다.
- 유휴 상태에서 압축한 경우(예: 사용자가 멈춰둔 채)에는 재개하지 않습니다.

## `compact_and_continue` 툴 (에이전트 호출용)

> **슬래시 명령(`/pi-vcc`, `/compact`)은 에이전트가 호출할 수 없습니다.** 사용자/TUI 명령이라,
> 모델이 `pi-vcc …` 를 bash 로 실행하려다 `command not found` 로 실패합니다. 그 대체재로 이
> 확장이 **에이전트가 호출 가능한 tool** 을 제공합니다.

```
compact_and_continue(followUp?, keep?)
```

- 안전한 경계(예: plan-tasks 한 단계가 commit·PLAN.md 갱신까지 끝나 재개 상태가 디스크에 있을 때)에서 호출.
- `keep` 기본값 **0** — 단일 user-turn 자율실행의 tail(완료된 단계 잡담)까지 전부 압축. (디스크에 상태가
  있어서 안전. tail-bound 한계 회피)
- 압축 후 `followUp` 프롬프트로 **자동 재개**(`pi.sendUserMessage(..., {deliverAs:"followUp"})`). 에이전트는
  툴 호출 직후 turn 을 끝내면 됨.
- `followUp` 생략 시 설정의 `resumePrompt` 사용.

비-git 프로젝트나 수동 경계 압축에 사용합니다. git 프로젝트에서는 아래 commit 자동 감지가 같은 일을 합니다.

## git commit 자동 경계 압축 (`compactOnCommit`)

에이전트가 매 단계 끝에 툴을 빠뜨리지 않도록, **성공한 `git commit` 을 자동 감지**해 경계 압축을 겁니다.
plan-tasks 는 한 단계 = 한 commit 이므로 commit 이 곧 단계 경계입니다.

- `tool_result` 이벤트에서 bash 명령이 commit 패턴(`commitPattern`)과 일치하고 `isError` 가 아닐 때 트리거.
  `--dry-run`, `git log|show|diff|status` 등 읽기 전용 verb 는 제외.
- **사용률 하한(`commitCompactMinPercent`, 기본 50%)** 이상일 때만 실행 → 짧은 초기 세션에서 매 commit 마다
  압축하거나 "압축할 게 없음" 에 걸리는 걸 방지. (90% 비상 임계치보다 한참 아래라 "단계 사이, 끊김 없이" 정리)
- 트리거 시 `keep:0` 경계 압축 + `resumePrompt` 자동 재개. `cooldownMs` 디바운스 적용.
- 끄려면 `compactOnCommit: false`. commit 메시지로 좁히려면 `commitPattern` 을 조정
  (예: `task` 커밋만 → `"\\bgit\\b[\\s\\S]*?\\bcommit\\b[\\s\\S]*task"`).

> **"압축할 내용이 없음" 으로 멈추지 않습니다.** 압축이 실패해도(예: 세션이 너무 작아 자를 게 없음) 작업을
> 끊었다면 그대로 다음 작업으로 재개합니다 — 멈춤 없이 계속됩니다.

## 설정 — `~/.pi/agent/ctx-autocompact-config.json`

| 키 | 기본값 | 설명 |
|---|---|---|
| `enabled` | `true` | 마스터 스위치 |
| `thresholdPercent` | `90` | 이 사용률(%) 이상에서 압축 |
| `checkIntervalMs` | `10000` | 폴링 주기(ms) |
| `cooldownMs` | `60000` | 압축 간 최소 간격(ms) |
| `showStatus` | `true` | 푸터에 실시간 사용률 표시 (`ctx 72%`) |
| `notify` | `true` | 압축 트리거 시 알림 |
| `minReclaimPercent` | `5` | 회수율이 이 % 미만이면 tail-bound 판정 → 보류 (위 참고) |
| `autoResume` | `true` | 작업 중 압축으로 turn 이 멈추면 자동으로 이어서 재개 (아래 참고) |
| `resumePrompt` | (한국어 기본문) | 재개 시 에이전트에 보내는 프롬프트 |
| `compactOnCommit` | `true` | 성공한 `git commit` 감지 시 경계 압축(keep:0)+재개 (아래 참고) |
| `commitCompactMinPercent` | `50` | commit 감지 압축의 사용률 하한(%) |
| `commitPattern` | `\bgit\b…\bcommit\b` | commit 으로 간주할 bash 명령 정규식 |

변경 후 `/reload` 또는 새 세션에서 반영됩니다.

## 명령어

```
/ctx-autocompact            상태 출력 (status)
/ctx-autocompact on|off     워치독 켜기/끄기
/ctx-autocompact now        지금 즉시 압축 강제 실행
/ctx-autocompact set 85     임계치를 85% 로 변경 (이번 세션 한정)
```
