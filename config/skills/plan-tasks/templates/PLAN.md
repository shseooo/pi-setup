# PLAN: <work title>

> Written and executed by pi. Steps needing a plan-before-code spec have a `docs/tasks/N.md`; simpler steps
> are coded directly (Task file = `—`).

## Goal
<what is being built — 1–3 sentences. What changes once done.>

## Constraints · Assumptions
- Language/framework: <e.g. Go 1.22 / React 18>
- Must not touch: <existing API, public interfaces, DB schema, etc.>
- Conventions to follow: <naming, directory structure, formatter>
- Environment: <build/test commands, dependencies, isolated-env path, etc.>

## Resume
> This file is the resume anchor. A fresh/interrupted session reads here to continue.
> Keep `RESUME` and the status boxes below current as each step finishes.

`RESUME: step <N>`   <!-- next step to do; "done" when all steps are [x] -->

## Step list
> Split a step if the change looks large.
> Task file column: a path (`tasks/N.md`) for steps that need a plan-before-code spec — logic/branching,
> multiple files, a design decision to pin, or > ~40 logic lines; `—` for single-file mechanical/boilerplate
> steps coded directly from PLAN + frozen test. When unsure, give it a file. Scaffolding is always `—`.
> Keep the Done box (`[ ]`/`[x]`) current — it's what a resumed session reads.

| Done | # | Title | One-line description | Run by | Est. change size | Task file |
|------|---|-------|----------------------|--------|------------------|-----------|
| [ ] | S | <scaffolding/setup> | <init · deps · test harness · layout> | pi directly | — | — |
| [ ] | 1 | <title> | <tangled-logic step> | pi (task) | ~XX lines | tasks/1.md |
| [ ] | 2 | <title> | <mechanical/boilerplate step> | pi (direct) | ~XX lines | — |
| [ ] | 3 | <title> | <description> | pi (task) | ~XX lines | tasks/3.md |

## Dependencies / order
- 1 → 2 → 3 (sequential)
- or: 2 after 1 is done. 3 is independent of 1.
- <explicitly which step must precede what>

## Overall completion criteria
- [ ] <final acceptance from a feature/test standpoint>
- [ ] <build · lint · tests pass>
