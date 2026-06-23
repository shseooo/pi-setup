---
name: kg
description: Behavioral guidelines to reduce common LLM coding mistakes. Use when writing, reviewing, or refactoring code to avoid overcomplication, make surgical changes, surface assumptions, and define verifiable success criteria.
license: MIT
---

# Karpathy Guidelines (kg)

Behavioral guidelines to reduce common LLM coding mistakes, derived from [Andrej Karpathy's observations](https://x.com/karpathy/status/2015883857489522876) on LLM coding pitfalls.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Surface ambiguity in writing before you touch code — don't resolve it silently.**

Before implementing, output an `ASSUMPTIONS:` list — one line per decision the request left open
(naming, file location, edge-case behavior, data shape, dependency choice). For each, write the
specific value you'll use. If you can't name a single open decision, write `ASSUMPTIONS: none`.

Then apply this rule per assumption:
- **Ask the user instead of proceeding** if EITHER holds: (a) being wrong would need a rewrite of
  code in more than one file or a public interface/schema/data change to undo, OR (b) two readings
  of the request lead to materially different implementations. State the readings as options.
- Otherwise proceed on the stated assumption — don't block on trivia that has a safe default.

If you find a simpler approach than what was asked, state it in one line and proceed with the
simpler one unless it drops a stated requirement; if it does, ask first.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Before finishing, scan the diff for these concrete smells and remove each one you find:
- a class/interface/abstraction with exactly one implementation or one caller
- a parameter, config flag, or option that no current caller passes a non-default value to
- a `try`/`catch` or guard for an input that cannot occur given the call sites
- a function used in exactly one place that adds no naming/testing value over inlining it
- duplicated logic that already exists elsewhere in the changed files

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.
