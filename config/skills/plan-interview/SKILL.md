---
name: plan-interview
description: >-
  Run a Socratic, one-question-at-a-time interview that crystallizes a vague request into a sharp spec —
  goal, testable acceptance criteria, constraints, and an ontology of key terms — by surfacing hidden
  assumptions, ambiguities, and boundary conditions before any code is planned. Keeps asking until the
  spec is unambiguous, then hands off to the plan-tasks skill.
  Invoke on signals like "인터뷰", "요구사항부터 정리", "스펙 잡아줘", "뭘 만들지부터 같이 정하자",
  "/plan-interview", "interview me", "let's nail down the spec", or when a request is too fuzzy to plan
  directly. Do NOT invoke for small, well-defined single edits.
---

# plan-interview

Turn a fuzzy request into a **sharp, unambiguous spec** through a Socratic interview, then hand it to
**plan-tasks** for planning and implementation. The interview's only job is to *crystallize understanding* —
it writes no project files and plans no code.

> **Relation to plan-tasks Phase 0**: plan-tasks has a light requirements-gathering loop of its own. Use
> `plan-interview` when the request is genuinely fuzzy and deserves a *deeper, rigorous* interview before
> planning. Its output is structured to satisfy plan-tasks's Phase 0 checklist, so the handoff is seamless and
> plan-tasks's own questioning becomes a quick confirmation rather than a fresh start.

## When to use / not use

- **Use**: the goal is vague, success isn't defined, scope boundaries are unclear, or the task is non-trivial
  and multiple interpretations exist.
- **Don't use**: a small, well-specified change. Just do it (or use plan-tasks directly).

## Core principles

1. **One question at a time.** Never dump a checklist. Ask the single highest-value question, read the answer,
   then decide the next one. A focused interview beats a questionnaire.
2. **Socratic, not administrative.** Each question should *surface something hidden* — an unstated assumption,
   an ambiguous term, a boundary/edge case, a conflicting requirement, a "what happens when…". Don't ask what
   you can find out yourself; explore the codebase first and only ask what the user alone knows.
3. **Prefer concrete over abstract.** Drive toward examples, numbers, and observable behavior. "What should
   happen when the input is empty?" beats "How should errors be handled?"
4. **Restate to confirm.** Periodically reflect understanding back in one line ("So X means Y — correct?") to
   catch misunderstandings early and converge faster.
5. **Track ambiguity, converge deliberately.** Keep a running sense of how much is still uncertain and stop
   when the stop criteria below are met — don't interview forever, don't stop early.

## What to crystallize

Drive the interview until these are all sharp. (This maps onto plan-tasks's Phase 0 checklist.)

- **Goal**: what is being built, in 1–3 sentences. The single outcome that defines success.
- **Acceptance criteria (≥ 5, testable)**: concrete, verifiable statements of done — each one something you
  could later write a test or check for. Vague ACs ("works well") are not acceptable; push for observable
  behavior.
- **Out of scope**: what this explicitly does *not* include. The boundary is as important as the goal.
- **Constraints / invariants**: language/framework/version, what must not be touched (public API, schema,
  conventions), allowed dependencies, performance/security limits.
- **Ontology**: definitions of the key domain terms the user uses, so you and the user mean the same thing.
  Pin down any word that could be read two ways.
- **Edge cases & priorities**: notable exceptional behaviors, and which parts matter most.
- **Environment**: where the work lives (project root path), how it's built/tested.

Use `AskUserQuestion` for questions with discrete choices (offer a recommended option first); use plain prose
for open-ended ones. Either way — **one topic per turn**.

## Stop criteria

Conclude when everything under "What to crystallize" is sharp (goal confirmed, **≥ 5 testable ACs**, ontology
with no two-way readings, explicit out-of-scope) **and** the next question would only gather trivia with a safe
default. For such minor items, state your assumption ("I'll assume X") instead of asking.

## Closing: crystallize, confirm, hand off

1. **Present the crystallized spec** as a single structured summary in the conversation (Goal / Acceptance
   criteria / Out of scope / Constraints / Ontology / Edge cases / Environment). Do **not** write it to a file
   — plan-tasks owns `docs/PLAN.md`.
2. **Get explicit confirmation** ("Does this capture it? Anything to add or change?"). Revise until the user agrees.
3. **Offer the handoff.** Ask whether to continue into planning + implementation now, e.g. via `AskUserQuestion`:
   - **Yes → run plan-tasks now (recommended)**: invoke the **plan-tasks** skill (`/skill:plan-tasks`). The
     confirmed spec above already satisfies plan-tasks's Phase 0 requirements gathering, so go straight to
     writing `docs/PLAN.md` (Phase 1) using this spec — treat Phase 0 as done, only re-confirming the project
     root path if it wasn't established here.
   - **Not yet**: stop here and leave the confirmed spec in the conversation for the user to use later.
