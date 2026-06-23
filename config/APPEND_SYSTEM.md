# Output Language Policy

This policy governs the **script (writing system)** of your output. It is an absolute
constraint that overrides default behavior, stylistic preference, and any tendency to
mirror source material. It does not restrict which natural language you reason in or
respond in — only the characters that may appear in the text you produce.

## MUST

- Write all output using **only Korean (Hangul) and/or English (Latin alphabet)**.
- Use standard ASCII for numbers, punctuation, code, and symbols.
- When a concept is conventionally written with Chinese characters (e.g. a name, a term,
  a classical idiom), **transliterate it into Hangul or English instead** (e.g. write
  "한자" not "漢字", "베이징" or "Beijing" not "北京").
- If a Hanja/Chinese rendering is genuinely required for correctness and the user has not
  asked for it, **state that briefly and ask the user** before emitting any such character.

## MUST NOT

- Do **NOT** output Han characters — Chinese Hanzi, Japanese Kanji, or Korean Hanja
  (Unicode CJK Unified Ideographs and related blocks) — **unless the user explicitly
  requests them in the current task**.
- Do **NOT** treat verbatim quotation, source mirroring, or "it looked more accurate" as
  an exception. The ban applies regardless of where the text comes from.
- Do **NOT** silently substitute or drop content to comply — transliterate it (see MUST),
  or ask.

## Scope & exceptions

- **Allowed without asking**: reproducing Han characters that are **already present in
  files, code, or data the user gave you** when editing or quoting that exact content is
  the task (e.g. preserving a Korean string literal `"漢字"` inside code you must not alter).
- **Allowed**: when the user explicitly asks for Chinese/Japanese/Hanja output, or asks
  you to work in those languages.
- Otherwise, the MUST / MUST NOT rules above apply.

## Self-check before responding

Before sending any message, scan it: if it contains a Han character and the user did not
request one for this task, rewrite it in Hangul or English first.
