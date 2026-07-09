---
name: plan-tasks
description: >-
  pi plans a large piece of work itself into docs/PLAN.md, decomposes that plan into small,
  independently-verifiable step tasks saved as docs/tasks/1.md, 2.md …, and then implements,
  verifies, and reviews each task directly. Each task is kept small ("one task = one concept",
  logic changes ~100 lines), and correctness is gated test-first.
  Invoke on signals like "plan this", "break into tasks", "decompose the work", "make a PLAN",
  "/plan-tasks", "plan and decompose". Do NOT invoke for small single-line edits.
---

# plan-tasks

A skill where **pi (this agent) owns the work end to end**: design, test authoring, scaffolding,
implementation, and review are all done by pi directly. Nothing is dispatched to an external model.

The core is **decomposition**. Instead of swinging at a large task in one go, break it into **small,
independently-verifiable tasks** and advance one at a time — gated by tests. That keeps the result
from drifting off the plan, gets it verified along the way, and lets you resume even if a session is cut off.

## Outputs

`docs/` is created under the **target project root**. Determine the project root in this priority:

1. If the user gives a path via argument or message, **treat that path as the root and write all files
   relative to that absolute path** (it may differ from the session CWD — don't assume the CWD, use the
   given path).
2. If no path is given, treat the session CWD as the root.
   Before starting, confirm the root path in one line (e.g. "Project root: `/abs/path`"), then create
   `docs/PLAN.md`, `docs/tasks/`, and the source/tests under it.

```
<project root>/docs/
  PLAN.md          # the full plan (goal, constraints, step list, dependencies)
  tasks/
    1.md           # task 1 (one file per step)
    2.md
    ...
```

## Core principles (must follow)

1. **Small scope**: the real splitting criterion is not line count but **"one task = one concept,
   independently verifiable"**. Keeping tasks small lets you verify in one shot and roll back easily when
   wrong. Use line count as a secondary gauge:
   - Changes with logic / branching / reasoning → **~80 lines by default, ~120 max**. Beyond that it's
     almost always a signal to split.
   - Mechanical / repetitive changes (boilerplate, mappings, enumerating similar cases) → **up to ~200 lines**.
   - If a single task mixes "and also", or unrelated changes across different files → split regardless of line count.
2. **Unambiguous spec**: a task file pins down "what, in which file, how" as concrete steps. Vague
   instructions like "handle appropriately" or "refactor if needed" are forbidden. If a task body is
   ambiguous during implementation, stop and fix the task first.
3. **Verifiable**: each task includes an acceptance-criteria checklist and a **verification command you can
   run as-is**. The task is done only when the verification command passes.
4. **Order**: run tasks in the dependency order from PLAN (1 → 2 → …). A task's verification must pass
   before moving to the next. Separate tasks by order so that multiple tasks never edit the same file at once.
5. **Reachability (wired in, not just written)**: a task is NOT done when the function/component/route/handler
   merely *exists and its unit test passes* — it is done only when it is **actually reached from the app's real
   entry point**. The most common failure of this workflow is "everything is implemented but nothing is called":
   pieces built in isolation that were never mounted/registered/invoked, so the built app does nothing. Guard it:
   - Every task that adds behavior must name its **call site** ("who invokes this, from where") in the task file,
     and either that same task or an explicit **wiring step** connects it to the entry point.
   - Its frozen test must exercise the behavior **through the real caller/entry point** (integration-first), not a
     unit that imports the function directly — an unwired function must make the test FAIL. (Pure-unit tests are a
     supplement, not the reachability proof.)
   - A green build does NOT prove reachability: dead/unused code compiles fine. Reachability is proven by an
     integration/e2e test or a smoke run of the actual app (Phase 2 step 5, Phase 3).

## Default flow: Test-first

For tasks that have logic / behavior, **use tests as the spec**:

- **Before implementing a task, pi writes the tests first** (creating the actual test file in the repo).
  Those tests are the task's spec and completion criterion — function signatures and expected behavior are
  pinned in the tests, so the implementation can't drift.
- That test file is treated as **frozen**. During implementation, do not edit the tests to make them pass.
  If they don't pass, **fix the implementation, not the tests**. (Only if you're certain the test itself is
  wrong — not merely that the implementation diverges from the test's intent — do you stop and explicitly fix the test.)
- Verification command = running those tests.

**Applicability**: the default for tasks with logic / behavior. However, tasks where tests are awkward or not
worth the cost — config files, scaffolding, migrations, pure boilerplate — skip the tests and fall back to an
acceptance-criteria checklist. pi decides which when writing the task and states it in the task file.

## Workflow

### Phase 0 — Requirements gathering (question loop)

**Before writing PLAN.md**, ask the user questions until all information needed to design the work is in hand.
Never move to phase 1 before that is satisfied.

> **If the request is genuinely fuzzy** (goal vague, success undefined, scope unclear), consider running the
> **plan-interview** skill (`/skill:plan-interview`) first — it runs a deeper Socratic interview that produces
> a confirmed spec satisfying this checklist. If plan-interview already ran in this session, treat Phase 0 as
> **done** from its confirmed spec (only re-confirm the project root path if needed) and go straight to Phase 1.

First explore the codebase and figure out what you can yourself (language, framework, existing structure, test
tooling), and only ask about **what can't be confirmed from the code or only the user knows**. The following
checklist must be fully filled:

- [ ] **Goal / scope**: what is being built, what is out of scope (definition of done)
- [ ] **Work location**: absolute path of the target project root (where `docs/` and source are created) and the target code paths
- [ ] **Language / framework / version**: ask if not confirmable from the code
- [ ] **Testing approach**: test framework and run command (whether to use the test-first flow or fall back)
- [ ] **Constraints / invariants**: what must not be touched (schema, public API, conventions), the range of dependencies that may be added
- [ ] **Edge cases / priorities**: exceptional behaviors to know, step priority

How to proceed:

1. Gather the uncertain items and ask them at once (grouping related ones together).
2. Take the answers, update the checklist, and if blanks remain, ask again — **repeat until all are satisfied**.
3. For minor items with a reasonable default, you may state "I'll proceed assuming X" and move on.
   For items that drive the design, you must get an answer.
4. Once the checklist is full, confirm with the user in a one-line summary and proceed to phase 1.

### Phase 1 — Plan (PLAN.md)

Based on the requirements gathered in phase 0, design how to implement the request (explore the codebase
further if needed). Then write `docs/PLAN.md`. Template: `templates/PLAN.md`.

PLAN.md must contain:

- **Goal**: what is being built (1–3 sentences)
- **Constraints / assumptions**: language/framework used, what must not be touched, existing conventions
- **Step list**: numbered steps. Step title + one-line description + a **status box** (`[ ]` / `[x]`) + a
  **task-file decision** per step (the "Task file" column: a path like `tasks/3.md`, or `—` for direct) + a
  **call site** note (where this step's code gets invoked from — the entry point/parent that reaches it).
- **Wiring / integration steps are first-class steps, not afterthoughts.** For every feature that adds a
  function/module/component, there must be a step (the same one, or a dedicated wiring step) that **connects it to
  the running app** — mount the route, register the handler, import & call it from `main`/`App`, add it to the DI
  container, etc. Order features and their wiring so the app stays runnable. Never leave a built piece unreferenced.
- **Vertical-slice ordering when possible**: prefer ordering that produces a *runnable end-to-end path early*
  (entry point → one real feature working) and then grows it, over building all leaf pieces first and integrating
  last. Integrating last is exactly when "implemented but never called" slips through.
- **Final step is always an end-to-end smoke check**: a step that **runs the actual app** and exercises the real
  user-facing path (start server + hit endpoint, render + interact, run the CLI) — proving the assembled system
  works, not just that units pass.
- **Dependencies / order**: which step must precede which
- **Resume pointer**: a one-line `RESUME:` marker naming the next step to do (e.g. `RESUME: step 3`).

**Classify each step at plan time — does it need a task file?** A task file is a *plan-before-code* forcing
function; it earns its cost only when there's something to think through. Decide by this concrete test and
record it in the step list:

- **Write a task file (`tasks/N.md`)** if **any** of these is true:
  - the step has conditional logic / branching / a non-trivial algorithm (not a straight-line transform);
  - it touches **more than one file**, or more than roughly one function's worth of logic;
  - the approach isn't fully determined by the frozen test alone — there's a design decision to pin (data
    shape, edge-case handling, ordering, error behavior);
  - estimated logic change is **> ~40 lines**.
- **Skip it (`—`, code directly from PLAN + frozen test)** only if **all** hold: single file, single obvious
  edit, mechanical/boilerplate/config/wiring with no branching, and the frozen test (or acceptance checklist)
  already fully specifies it.
- **When unsure, write the file.** The default is to write it; `—` is the exception you can justify. (Don't
  label steps "mechanical" just to skip work — the frozen test still gates correctness either way.)

> **PLAN.md is the resume anchor**, not the task files — those are written just-in-time per step, so future
> steps have no file yet if a session is interrupted. Keep the status boxes + `RESUME:` pointer current as you
> go (Phase 2 step 6); a resumed session reads them (plus the frozen tests and repo) and re-enters the loop.

Once PLAN is written, show it to the user and **get approval** before moving to the Phase 2 loop.

### Phase 2 — Per-step loop: one task at a time (decompose → implement → verify)

Decomposition and execution are **interleaved, one step at a time** — not two bulk phases. **pi does this
directly**; do not spawn an external model or subprocess (`pi -p`), write the code with this session's
Read/Edit/Write. For long work, confirm with the user before starting.

> **Why a loop, not "write all task files then code":** for steps that get a task file, writing it
> **immediately before implementing that step** ties the spec to a concrete, verified payoff. Writing all of
> them up front has no payoff for the executor (you already hold the plan), so it gets skipped and PLAN
> degrades into a bare checklist. Materialize, implement, verify — then move on.

Iterate over PLAN's steps **in dependency order** (1 → 2 → …). For each step N (skip scaffolding-type steps
marked "Run: pi directly (no task file)"):

1. **Write `docs/tasks/N.md`** — *only if the step was classified as needing one* in Phase 1 (Task-file
   column ≠ `—`). For a `—` step, skip to 2 and implement directly from PLAN + the frozen test. When you do
   write it: template `templates/task.md`; match N to the PLAN step; fill all 4 sections (goal+context /
   target files+excerpts / step-by-step+constraints / acceptance+verification). Read code excerpts **from the
   actual files**, don't invent them, and **tier the excerpt volume**: minimal (only the block/signature that
   changes) for simple parts, fuller surrounding code only where logic is tangled. If the step now looks like
   it will exceed scope (principle 1), split it into N.md + the next number and update PLAN's step list first.
2. **Write the frozen test — integration-first** (test-first steps): create the actual test file in the repo (e.g.
   `pkg/foo/bar_test.go`); if the step has a task file, reference its path+content in the "Tests (frozen)"
   section. The verification command runs exactly those tests. For steps where tests don't fit (config, pure
   boilerplate), skip the test and rely on the acceptance checklist.
   - **Exercise the behavior through its real caller/entry point, not by importing the leaf function directly.**
     e.g. test the HTTP route via the app's router (not the handler function alone); assert `App` renders the
     feature (not just that the child component renders in isolation); drive the CLI entry (not just the inner
     fn). The point: if the new code is never wired into that path, the test must **fail** — this is what catches
     "implemented but never called." Add a focused unit test on top only when the logic needs finer coverage.
3. **Load coding guidelines (required)**: implementation code must be written with the `/skill:kg`
   guidelines **in context**. Check at every step: if they are NOT currently in context — the first step
   of a session, or any step right after a compaction/resume wiped them — **invoke `/skill:kg` before
   coding**. If they were loaded earlier in this session and still survive in context, do not re-invoke
   (that only duplicates text); just keep following them. Note that the step-boundary compaction in
   step 8 ALWAYS wipes them, so a resumed session must re-invoke here.
4. **Implement** exactly per the task file (or, for `—` steps, per the PLAN step + frozen test). Stay within
   the step's file scope. Do not touch the frozen tests.
5. **Verify — two gates, both must be green**:
   a. **Task verification**: **actually run** the task's verification command and confirm it passes (don't wave it
      through as "looks done"). Confirm the frozen tests weren't changed (e.g. `git diff -- <test path>`).
   b. **Full build & test**: then run the project's **whole build and entire test suite** (not just this step's
      tests) — e.g. `npm run build && npm test`, `go build ./... && go test ./...`, `cargo build && cargo test`
      (for greenfield, from `app/`: `cd app && npm run build && npm test`). This catches regressions and
      integration/build breakage the moment a step introduces them, instead of deferring to Phase 3.
   c. **Dead-code / reachability check**: run a detector for code that is defined but never used/imported/called,
      and confirm THIS step's new code is not orphaned — e.g. `knip` or `ts-prune` (JS/TS), `go vet` +
      `staticcheck -checks U1000` or `deadcode ./...` (Go), the compiler's unused-symbol lint (Rust `dead_code`,
      etc.). A green build hides orphans; this is what surfaces "the function exists but nothing calls it."
      New unused exports/functions introduced by this step must be either wired in or removed — not left dangling.
   d. **Smoke run (entry-point-affecting steps)**: if the step touches or should be reachable from the app's real
      entry path, **actually run the app and hit that path** (start the server + curl the endpoint, render +
      interact, run the CLI) — or delegate to the `/run` or `/verify` skill. Confirm the feature works through the
      running system, not only that tests pass.
   - Pin the exact build & test / dead-code / smoke commands in PLAN's constraints/assumptions (and in `AGENTS.md`)
     so every step and any resumed session runs the same ones. A step is **not done** until (a)–(c) pass (and (d)
     where it applies); on failure treat it like any verification failure (step 6) — fix the implementation
     (usually: wire the code in), don't disable/skip tests or silence the dead-code warning.
6. **Mark done & advance**: in PLAN.md, check the step's status box `[x]` and move the `RESUME:` pointer to
   the next step (so an interrupted session can pick up here).
   On failure: read the log, fix the implementation, retry 1–2 times. If still stuck, stop and report, or
   redesign that task (the spec itself may be wrong). **Don't pile long failure logs / test output into the
   main session.** When diagnosis runs long, delegate root-cause analysis to a subagent (the Agent tool) and
   **bring back only the conclusion — what failed, why, and which task to change how**. Keep the raw material
   (full logs, diffs) in the subagent so a drawn-out verify loop doesn't blow up the main context's tokens.
7. **Commit (one commit per completed task)**: once the step's verification passes and PLAN.md is updated,
   commit **only after** verification is green — never commit a failing or half-done step. The commit captures
   that step's work as one atomic unit: the implementation, the frozen test, the new `docs/tasks/N.md`, and the
   PLAN.md status/`RESUME:` update. Stage exactly those files for this step (don't sweep in unrelated changes),
   then commit. Use a short message tied to the step, e.g. `task N: <step title>` (keep PLAN.md, task files,
   and messages in the user's language).
   - If the project is **not a git repo**, skip committing (note it once and continue). If it has uncommitted
     pre-existing changes, ask the user how to handle them before starting the loop rather than committing them.
   - This per-task commit is what makes the workflow cleanly resumable and each step independently
     reviewable/revertible — it mirrors the "one task = one concept" principle at the VCS level.
8. **Advance (compaction is automatic)**: committing the task IS the step boundary. The `ctx-autocompact`
   extension **detects the successful `git commit` and automatically compacts (keep:0) + re-prompts you to
   continue** — you do not need to do anything. Just commit and proceed; if the extension fires, you'll be
   resumed with a follow-up that says to re-read `docs/PLAN.md` and continue from the `RESUME:` step. The
   compaction also wipes the `/skill:kg` guidelines from context — the resumed session must re-invoke
   `/skill:kg` before implementing the next step (step 3 above). Each
   committed step is a clean resume point — PLAN.md status boxes, the `RESUME:` pointer, the committed code, and
   the frozen tests all persist on disk, so the per-step implementation/verify chatter doesn't need to stay in
   context.
   - **Do NOT run `/pi-vcc` or `/compact` as a shell/slash command** — those are user/TUI commands; the agent
     cannot invoke them (running `pi-vcc …` in a shell fails with `command not found`).
   - **Non-git projects** (no commit to detect): once verification is green and PLAN.md is updated, **call the
     `compact_and_continue` tool** (followUp e.g. `/skill:kg 를 다시 로드한 뒤 docs/PLAN.md 를 다시 읽고
     RESUME 다음 단계를 이어서 진행`, keep defaults to 0) to free context and auto-resume. End your turn
     right after calling it.
   - If neither the auto-compaction nor the tool is available (extension not loaded), just continue to the next
     step — never substitute a shell command for compaction.
   - **Why keep:0:** this whole run is a *single user turn* (one prompt kicked off the multi-step work), so a
     default compaction keeps the entire run as an un-compactable "tail" and reclaims almost nothing. keep:0
     compacts the whole completed-step tail — safe **only** because the resume state lives on disk, exactly here.
     (Below the extension's `commitCompactMinPercent` usage floor, auto-compaction holds off and nothing happens —
     that's expected for short sessions.)

**Guardrails (the easy-to-skip ones):**

- Do NOT batch-write all task files up front — write each one just before its step.
- Implement straight from PLAN **only** for steps marked `—` in the Task-file column. If a step has a task
  file, write it before coding. Don't reclassify a step to `—` mid-loop just to skip the file.
- If a task body turns out ambiguous or wrong mid-implementation, stop and fix the task file — don't code around it.

### Pin durable execution rules in AGENTS.md

pi auto-loads `AGENTS.md` (or `CLAUDE.md`) from the project root and parent directories **at the start of
every session** — even on a resumed or fresh session where this skill is not re-invoked. So instead of
re-stating the same execution constraints each turn, pin them once in `AGENTS.md` at the project root and they
apply to every task automatically. This is what keeps the frozen-test discipline and task-scope rules alive
across session boundaries (which the resumability of this workflow depends on).

**Create/update it during scaffolding** (or before starting the Phase 2 loop on an existing project). Keep it
short and imperative:

```markdown
# AGENTS.md — execution rules for plan-tasks

- Implement only what the current task file (docs/tasks/N.md) specifies. Stay within its `files` scope.
- NEVER modify or delete frozen test files (e.g. _*test.go, tests/test*_.py). Fix the implementation, not the tests.
- Before writing implementation code for a task, the /skill:kg guidelines must be in context — if they
  are not (fresh or resumed/compacted session), invoke /skill:kg first, then follow it.
- A function/component/route is NOT done when it merely exists and its unit test passes — it is done only when it
  is actually CALLED from the app's real entry point. Every behavior task must wire its code to the entry point
  (mount route / register handler / import & call from main/App), and its frozen test must exercise it THROUGH
  that real path so an unwired piece fails the test. "Implemented but never called" is the #1 bug to prevent.
- After implementing, run the task's verification command AND the full build & test (e.g. `npm run build && npm test`
  / `go build ./... && go test ./...`) and confirm BOTH pass before stopping. A step is done only when both are green.
- Also run a dead-code / unused-export check (`knip`/`ts-prune`, `deadcode ./...`/`staticcheck -checks U1000`,
  compiler unused lints); new code that is defined-but-never-used means a wiring gap — wire it in or remove it,
  don't silence the warning. For entry-point-affecting steps, smoke-run the actual app (or use /run, /verify).
- After a task's verification passes and PLAN.md is updated, commit that task as ONE commit (implementation +
  frozen test + docs/tasks/N.md + PLAN.md update), message `task N: <step title>`. Never commit a failing step.
- Compaction between steps is AUTOMATIC: the ctx-autocompact extension detects the `git commit` and compacts
  (keep:0) + re-prompts to continue. Just commit and proceed — do NOT run `/pi-vcc` or `/compact` as a shell/slash
  command (the agent cannot invoke those). For a non-git project, call the `compact_and_continue` tool instead.
  If neither is available, just continue to the next step.
- Standard library only unless the task explicitly allows a new dependency.
- Use the project-local environment for all commands (e.g. `.venv/bin/pytest`, the pinned toolchain).
```

Tailor the dependency/environment lines to the project's actual stack and the decisions recorded in PLAN.

### Phase 3 — Review

When all tasks are done, review against PLAN's **overall completion criteria**. Since each task's tests
already gated correctness, focus the review on style, regressions, edge cases the tests missed, and
cross-step integration. Run the full build / lint / tests once more, and report any gaps or regressions to the user.

**Mandatory end-to-end run — do NOT skip, and do NOT report "done" without it.** Unit/integration tests passing is
not proof the assembled app works; the recurring failure of this workflow is "all pieces built, some never wired
in." So actually run the system:

1. **Run the real app and drive the real user-facing path(s)** — start the server and hit the endpoints, launch
   the UI and interact, or run the CLI with real args. Use the `/run` or `/verify` skill to launch and observe it.
   Confirm the primary flows from PLAN's Goal actually work in the running app, not just in tests.
2. **Full dead-code / unused-export sweep across the whole project** (`knip` / `ts-prune`, `deadcode ./...` /
   `staticcheck -checks U1000`, compiler unused lints). Every hit is either an intentionally-public API (justify
   it) or a wiring gap / orphan — treat orphans as bugs: wire them in or remove them.
3. **Trace each PLAN feature to a live call path**: for every feature, confirm there is a real invocation chain
   from the entry point to it (route registered, handler mounted, function called, component rendered). Anything
   reachable only from its own test is not actually shipped.

Report the run results (what you exercised and what you observed), the dead-code sweep outcome, and any gaps
found + fixed. If any primary flow doesn't run, it's a Phase 2 bug — fix it before declaring done.

## Greenfield projects (starting from zero)

Starting in an empty directory means there is no existing code to explore. Adjust as follows:

- **Phase 0**: since nothing can be inferred from code, **get the tech stack, directory structure, and
  build/test tooling entirely from the user**. pi **proposes** a directory layout and core interfaces and
  proceeds **after approval**.
- **Verify the toolchain first**: before running scaffolding commands, confirm the required runtime, package
  manager, and test runner actually exist. The system default interpreter may be older than required (e.g.
  `python3` is 3.9). Find an interpreter with the required version (notify the user if absent), and **create
  a project-local environment to isolate** it (e.g. `uv venv --python 3.x` or `python -m venv`). Write later
  verification commands against that environment's absolute/relative paths (e.g. `.venv/bin/pytest`). Record
  this decision in PLAN's constraints/assumptions.
- **pi runs scaffolding directly**: the first step is almost always scaffolding — project init, dependency/
  package manager, test harness, directory layout, lint/format config, and the project-root `AGENTS.md`
  (see "Pin durable execution rules in AGENTS.md" above). **Do not make a task file for this**;
  pi **runs the commands and writes the config files directly** (it's a one-time, fragile setup). Record the
  step in PLAN.md but mark it **"Run: pi directly (no task file)"**, and number `docs/tasks/` from the first
  feature step after scaffolding.
- **Scaffolders that require an empty directory** (e.g. `npm create vite@latest`, `create-next-app`,
  `npm create svelte`): by this point the project root is **not empty** — Phase 1 already wrote `docs/PLAN.md`
  (and possibly `docs/tasks/`, a git repo, `AGENTS.md`). Those tools abort on a non-empty target. **Do not delete
  `docs/` to satisfy them** — it is the resume anchor. Instead, **scaffold into an `app/` subfolder and do all
  development there**, keeping `docs/` at the root:
  1. **Create an empty `app/` dir under the project root** (`<root>/app`). `docs/`, `.git/`, and `AGENTS.md` stay
     at the root, so `app/` is a clean slate for the scaffolder.
  2. **Run the scaffolder into `app/`** (e.g. `npm create vite@latest <root>/app -- --template react-ts`, or `cd`
     into `app/` and run it with `.`). No temp dir, no copy/merge step.
  3. **All subsequent development happens inside `app/`** — source, tests, `package.json`, install, build, lint.
     `docs/` (PLAN.md, tasks/) and the root `AGENTS.md` remain at the project root, one level above `app/`.
  4. **Write every later verification command against `app/` paths** (e.g. `cd app && npm test`, `app/.venv/bin/pytest`),
     and **state task file `files` scopes relative to `app/`** so steps edit the right tree.
  - Resulting layout: `<root>/{docs/, AGENTS.md, app/{src, tests, package.json, …}}`.
  - Record this "scaffold + develop inside `app/`" decision (and that verification commands run from `app/`) in
    PLAN's constraints/assumptions so a resumed session follows the same layout. (Same pattern applies to any
    generator that insists on an empty/dedicated target.)
- **Check the latest versions (required)**: before pinning any framework/library/SDK/CLI version in
  scaffolding, **you MUST check the latest docs via the context7 MCP** (`resolve-library-id` → `query-docs`).
  Training data versions may be stale, so don't pin versions by guessing — confirm the current version and
  install/config steps via context7 and apply them. Record the confirmed versions in PLAN's constraints/assumptions.
- **Set up the dead-code / unused-export tool during scaffolding** so the per-step reachability gate can run:
  e.g. add `knip` (or `ts-prune`) for JS/TS, plan to use `deadcode ./...` / `staticcheck -checks U1000` for Go,
  enable the compiler's unused lints for Rust. Pin the exact command in PLAN's constraints/assumptions.
- **Confirm scaffolding done**: after setup, directly verify the build, an empty test run, AND the dead-code
  check work (e.g. "`go test ./...` passes even with empty tests", "`npm run build` succeeds", "`npx knip` runs").
- **From the Phase 2 loop on**: once scaffolding is done and the test harness is ready, run the per-step loop
  for each feature step — write that step's `docs/tasks/N.md` and implement it immediately (test-first),
  one step at a time.
- **Skeletons instead of excerpts**: with no existing code to excerpt, put the **interfaces and file skeletons
  pi designed (function signatures, types, empty functions with signatures only)** into the task's "target
  files" section, so implementation fills them in rather than improvising the API.

## Notes when writing

- When excerpting for a task file, don't read whole large files — **use search to pull only the relevant
  parts** (symbol lookup, grep, the Explore agent). Cuts the input tokens your own session spends planning.
- Avoid duplicate work across tasks, and separate by order so multiple tasks don't edit one file at once.
- Write files with native Write/Edit.
- Keep PLAN.md, task files, and user conversation in the user's language; since pi is the executor, there's no
  reason to force task bodies into a specific language. Leave original strings/comments inside code excerpts as-is.
