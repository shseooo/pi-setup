# pi-setup

`pi` 에이전트의 `~/.pi` 설정을 새 머신에 재현하는 설치 스크립트.

## 설치

```bash
# 1. 시크릿 준비 (이미 .env 가 채워져 있으면 생략)
cp .env.example .env
#   .env 를 열어 CONTEXT7_API_KEY / EXA_API_KEY 입력

# 2. 설치
./install.sh
```

다른 위치에 설치하려면 `PI_HOME=/원하는/경로 ./install.sh`.

## 무엇이 설치되나

| 항목 | 내용 | 위치 |
|------|------|------|
| **extensions (npm)** | `@hypabolic/pi-hypa`, `@sting8k/pi-vcc`, `context-mode`, `pi-mcp-adapter`, `pi-web-access` | `~/.pi/agent/npm` (npm install) |
| **extensions (local)** | `ctx-autocompact.ts` — 컨텍스트 사용량 감시 + git commit 경계 자동 압축/재개 | `~/.pi/agent/extensions/` |
| **extensions (local)** | `english-buddy/` — 영어 코치: 프롬프트 자동 교정·번역·`::` 리파인, `/eb` 통계·드릴 (자세한 내용은 해당 README) | `~/.pi/agent/extensions/english-buddy/` |
| **english-buddy 데이터** | 기본 config(코치 모델: omlx2 gemma) + 코딩 프롬프트 영어 단어장. config 는 이미 있으면 보존 | `~/.pi/english-buddy/` |
| **mcp** | `context7` (API 키 주입) | `~/.pi/agent/mcp.json` |
| **skills** | `kg`, `plan-interview`, `plan-tasks` | `~/.pi/agent/skills/` |
| **config** | provider/model(omlx · Qwen3.6-27B-oQ4e-mtp), 패키지 목록, compaction 설정 | `~/.pi/agent/settings.json` |
| **models** | omlx (`http://127.0.0.1:7999/v1`) + llama.cpp (`http://127.0.0.1:1235/v1`) + omlx2 (tailscale 원격, english-buddy 코치용 gemma) | `~/.pi/agent/models.json` |
| **compaction** | pi-vcc 알고리즘 압축 설정 | `~/.pi/agent/pi-vcc-config.json` |
| **autocompact** | ctx-autocompact 임계치/커밋 경계/재개 프롬프트 설정 | `~/.pi/agent/ctx-autocompact-config.json` |
| **system prompt** | 출력 언어 정책 | `~/.pi/agent/APPEND_SYSTEM.md` |
| **web search** | exa (API 키 주입) | `~/.pi/web-search.json` |
| **trust** | 설치 머신의 `$HOME` 로 자동 생성 | `~/.pi/agent/trust.json` |
| **external** | `hypa` 런타임 (curl 설치, PreToolUse 훅) | PATH |

## 사전 요구 / 외부 의존

- **node / npm** — extensions 설치에 필요 (없으면 중단).
- **curl** — Hypa 설치에 필요.
- **hypa** — `curl -fsSL https://hypabolic.github.io/Hypa/install.sh | sh` 로 설치.
  이미 설치돼 있으면 건너뛴다. `SKIP_HYPA=1 ./install.sh` 로 생략 가능.
- **omlx 모델 서버** — `models.json` 의 기본 프로바이더는 `http://127.0.0.1:7999/v1`
  를 기대한다. MLX 등 로컬 서버는 **이 스크립트가 설치하지 않으므로** 별도로 띄워야 한다.
- **llama.cpp 서버** — `models.json` 의 `llama.cpp` 프로바이더는 `http://127.0.0.1:1235/v1`
  을 기대한다 (역시 별도로 띄워야 함).

## 동작 메모

- 기존 파일은 덮어쓰기 전에 `*.<타임스탬프>.bak` 으로 백업한다.
- **시크릿은 repo 에 커밋되지 않는다.** `mcp.json` / `web-search.json` 의 키는
  `__CONTEXT7_API_KEY__` / `__EXA_API_KEY__` 플레이스홀더로 저장되며,
  설치 시 `.env`(또는 환경변수)에서 주입된다. `.env` 는 `.gitignore` 처리됨.
- 키가 비어 있으면 플레이스홀더를 그대로 둔 채 경고하고 계속 진행한다.
  나중에 `.env` 를 채우고 다시 실행하면 된다.

## 갱신

`~/.pi` 설정을 바꾼 뒤 repo 에 반영하려면 `config/` 아래 해당 파일을 복사하면 된다
(시크릿 파일은 플레이스홀더 유지). 설치된 라이브 설정과 repo 스냅샷은 별개다.
