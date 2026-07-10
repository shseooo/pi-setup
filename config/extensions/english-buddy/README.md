# english-buddy (pi extension)

pi port of [xiaolai/claude-english-buddy-for-claude](https://github.com/xiaolai/claude-english-buddy-for-claude) — an English language coach for non-native speakers who use coding agents daily.

Every prompt you type is checked by a small, cheap "coach" model **before** the agent sees it. You keep working in imperfect English (or your native language); the agent receives clean English; you see exactly what was corrected and learn from it over time.

## What it does

| You type | What happens |
|---|---|
| English with mistakes | Coach fixes spelling/grammar/word choice minimally → agent gets the corrected prompt; a `✎` card shows each fix as `wrong → right (category)` |
| English with no mistakes | Passes through untouched (logged as clean) |
| Non-English (CJK, etc.) | Translated to natural English → agent gets the translation; card shows source language |
| `:: rough idea` | Rewritten into a precise, well-engineered prompt (works even when auto-correct is off) |
| Slash commands, code, URLs, short text | Skipped entirely |

The coach **never blocks you**: on any error or timeout your original text passes through unchanged. Only interactively-typed input is coached (never RPC/extension messages).

Every correction is appended to `~/.pi/english-buddy/history/YYYY-MM-DD.jsonl` for trend tracking. The footer shows a live counter: `✎ EB <fixed>/<total>`.

## Commands

All under a single `/eb` command (tab-completes):

- `/eb` or `/eb today` — today's report: counts, error rate vs yesterday/7-day, recurring + recent fixes
- `/eb stats [days]` — long-term trends (default 30 days) with 4-week fix-rate trend and top patterns
- `/eb mistakes [top]` — all-time recurring mistakes (default top 20) with focus areas
- `/eb drill` — asks the **main agent** to quiz you with 5 practice sentences targeting your worst categories
- `/eb review [text]` — deep writing review by the main agent (opens an editor if no text given)
- `/eb preview <text>` — dry-run a correction without sending or logging anything
- `/eb on` / `/eb off` — resume/pause auto-correction (`::` refine keeps working)
- `/eb config` — show config; `/eb config set <key> <value>` to change

## Configuration

`~/.pi/english-buddy/config.json` (also editable via `/eb config set`):

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Master switch |
| `autoCorrect` | `true` | Gates correct + translate modes |
| `model` | `null` | Coach model as `provider/model-id` (e.g. `anthropic/claude-haiku-4-5`). `null` auto-picks the smallest authed model (haiku → flash → mini → nano → current model) |
| `summaryLanguage` | `null` | e.g. `"Korean"` — asks the main agent to append a short summary in that language after each response |
| `domainTerms` | `[]` | Comma-set terms the coach must never "correct" (e.g. `/eb config set domainTerms Tailscale,Headscale`) |
| `timeoutMs` | `20000` | Coach timeout before passing through unchanged |
| `maxAnnotations` | `3` | Max corrections surfaced per prompt |

No API key setup needed — the coach call goes through pi's own model registry, so whatever auth pi already has (API key, OAuth, proxy) is reused.

## Files

- `index.ts` — event wiring (`input` transform, footer, cards), `/eb` command, reports
- `coach.ts` — coach system prompts (ported verbatim) + LLM call via pi-ai
- `detect.ts` — language detection (ASCII-ratio) and skip heuristics (port of `detect.mjs`)
- `state.ts` — config + daily JSONL history (port of `state.mjs`)
- `stats.ts` — trends and pattern extraction (port of `stats.mjs`)

Reload with `/reload` after editing.
