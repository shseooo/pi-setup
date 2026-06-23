---
id: <N>
title: <task title>
plan_step: <step number in PLAN.md>
depends_on: [<prerequisite task ids, e.g. 1>]   # [] if none
files: [<paths to modify/create>]
est_change_lines: <estimated changed lines — logic ≤120 / mechanical ≤200, one concept only>
---

# Task <N>: <title>

> Implement exactly per this task's spec. The context you need is excerpted in section 2 below;
> if it's not enough, you may read the referenced files directly. But keep changes limited to the
> `files` scope in the frontmatter.

## 1. Goal + context
- **What this task does**: <1–2 sentences>
- **PLAN step**: <step N — where this sits in the overall plan>
- **Background**: <minimum context needed: domain terms, why this is needed>
- **From prerequisites**: <what depends_on tasks produced — e.g. "task 1 defined the User struct">

## 2. Target files + code excerpts
**File to modify**: `<path>`

Current relevant code (excerpted from the actual file):
```<lang>
<paste the relevant existing code verbatim — functions / types / imports>
```

**File to create** (if any): `<path>` — <what it holds>

## 2b. Tests (frozen — written first by pi, DO NOT modify during implementation)
> These tests are the spec. The implementation must make them pass.
> The test file already exists in the repo. Do not edit or delete it during implementation.
> (If this is not a test-first task, leave this whole section empty and rely on section 4.)

**Test file**: `<path, e.g. pkg/foo/bar_test.go>`

```<lang>
<paste the tests written first, so the expected behavior is clearly visible>
```

## 3. Step-by-step instructions + constraints
Do exactly the following, in order:
1. <imperative instruction 1>
2. <imperative instruction 2>
3. <imperative instruction 3>

**Constraints**:
- Keep the change under about **<limit> lines** (~120 logic / ~200 mechanical). If it exceeds this, stop and report.
- Modify ONLY the files listed in `files`. Do not touch any other file.
- <keep function signatures / preserve import order / formatter rules>

**Do NOT**:
- Do NOT modify or delete the test file(s) in section 2b. They are frozen. Fix the implementation, not the tests.
- No refactoring outside the requested scope.
- No new dependencies (unless explicitly allowed).
- <other prohibitions>

## 4. Acceptance criteria + verification
**Acceptance criteria**:
- [ ] The frozen tests in section 2b pass. (Primary gate for test-first tasks.)
- [ ] <verifiable condition 1>
- [ ] <verifiable condition 2>

**Verification command** (must pass to be considered done — runs the section 2b tests):
```bash
<e.g. go build ./... && go test ./pkg/foo/ -run TestBar>
```

**Expected output format**: <e.g. full content of the modified file / a unified diff>
