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

> "Call site" = where this step's code gets invoked from (the entry point/parent that reaches it). Every behavior
> step must be wired to the running app; add explicit wiring steps and a FINAL end-to-end smoke step.

| Done | # | Title | One-line description | Run by | Call site (wired from) | Est. change size | Task file |
|------|---|-------|----------------------|--------|------------------------|------------------|-----------|
| [ ] | S | <scaffolding/setup> | <init · deps · test harness · dead-code tool · layout> | pi directly | — | — | — |
| [ ] | 1 | <title> | <tangled-logic step> | pi (task) | <e.g. router.go / App.tsx / main()> | ~XX lines | tasks/1.md |
| [ ] | 2 | <title> | <mechanical/boilerplate step> | pi (direct) | <caller> | ~XX lines | — |
| [ ] | 3 | <wire feature into entry point> | <mount route / register / call from main> | pi (task) | <entry point> | ~XX lines | tasks/3.md |
| [ ] | E | End-to-end smoke | run the real app, drive the primary user path | pi directly | — | — | — |

## Dependencies / order
- 1 → 2 → 3 (sequential)
- or: 2 after 1 is done. 3 is independent of 1.
- <explicitly which step must precede what>

## Overall completion criteria
- [ ] <final acceptance from a feature/test standpoint>
- [ ] <build · lint · tests pass>
- [ ] **App runs end-to-end**: the real app was launched and the primary user-facing path(s) work (not just tests).
- [ ] **No orphaned code**: dead-code / unused-export sweep is clean — every feature is reachable from the entry point.
