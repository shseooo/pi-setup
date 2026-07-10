// Language detection — determines whether text is English, non-English, or mixed.
// Ported from claude-english-buddy scripts/lib/detect.mjs.
// Uses ASCII ratio heuristic: CJK/Cyrillic/Arabic characters fall outside the
// ASCII printable range (0x20-0x7E).

export type CoachMode = "correct" | "translate" | "refine" | "skip";

export interface Detection {
  mode: CoachMode;
  text: string;
  language?: string;
  ratio?: number;
  /** For slash-command inputs: the command token + whitespace to re-prepend after coaching the args. */
  prefix?: string;
}

export function detectLanguage(text: string): { language: string; mode: CoachMode; ratio: number } {
  if (!text || text.trim().length === 0) {
    return { language: "unknown", mode: "skip", ratio: 0 };
  }

  const chars = [...text];
  const totalChars = chars.length;
  if (totalChars === 0) {
    return { language: "unknown", mode: "skip", ratio: 0 };
  }

  let asciiCount = 0;
  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    if (code >= 0x20 && code <= 0x7e) asciiCount++;
  }

  const ratio = Math.round((asciiCount / totalChars) * 100);

  if (ratio >= 85) {
    return { language: "english", mode: "correct", ratio };
  }
  return { language: "non-english", mode: "translate", ratio };
}

/** Skip checks that apply to the coachable text body (prompt or slash-command args). */
function shouldSkipBody(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  if (text.startsWith("!")) return true;

  // Entirely a fenced code block
  const trimmed = text.trim();
  if (trimmed.startsWith("```") && trimmed.endsWith("```")) return true;

  // Too short — use both char and word count (CJK has no spaces)
  const charCount = [...text].length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (charCount < 10 && wordCount < 3) return true;

  // Code/URL patterns
  if (/^(https?:|git@|ssh:\/\/|\{|\[|\(|npm |pip |cargo |brew |sudo |cd |ls |cat |grep |find |docker |kubectl )/i.test(text)) {
    return true;
  }

  return false;
}

export function shouldSkip(prompt: string): boolean {
  if (prompt.startsWith("/")) return true;
  return shouldSkipBody(prompt);
}

export interface DetectOptions {
  /** Coach the arguments of slash commands (`/skill:foo <args>`), preserving the command token. */
  slashArgs?: boolean;
}

export function detectMode(prompt: string, opts?: DetectOptions): Detection {
  if (prompt.startsWith("::")) {
    const text = prompt.slice(2).trimStart();
    return { mode: "refine", text };
  }

  // Slash commands: never touch the command token itself. With slashArgs on,
  // coach the argument text and re-prepend the token on transform.
  const slash = prompt.match(/^(\/\S+)(\s+)([\s\S]+)$/);
  if (slash) {
    if (!opts?.slashArgs) return { mode: "skip", text: prompt };
    const args = slash[3];
    if (shouldSkipBody(args)) return { mode: "skip", text: prompt };
    const detection = detectLanguage(args);
    return {
      mode: detection.mode,
      text: args,
      prefix: slash[1] + slash[2],
      language: detection.language,
      ratio: detection.ratio,
    };
  }
  if (prompt.startsWith("/")) return { mode: "skip", text: prompt };

  if (shouldSkipBody(prompt)) {
    return { mode: "skip", text: prompt };
  }

  const detection = detectLanguage(prompt);
  return { mode: detection.mode, text: prompt, language: detection.language, ratio: detection.ratio };
}
