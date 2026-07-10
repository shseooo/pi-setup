// The coach LLM call. System prompts ported verbatim from
// claude-english-buddy scripts/prompt-coach-hook.mjs, but the API call goes
// through pi's own model registry + pi-ai instead of a raw Anthropic fetch,
// so whatever auth pi already has (API key, OAuth, proxy) just works.

import { completeSimple } from "@earendil-works/pi-ai/compat";
import type { Model, Api } from "@earendil-works/pi-ai";
import { debugLog, type EbConfig, type Annotation } from "./state";

export const SYSTEM_CORRECT = `You are an English language coach for a non-native speaker who uses AI coding tools daily.
The user's prompt will be processed by an AI assistant that understands them regardless of errors. Your job is to help the USER improve by showing corrections.

Rules:
- Fix spelling, grammar, punctuation, and word choice errors
- Improve awkward phrasing to sound natural
- Keep technical terms, code references, and tool names unchanged
- Preserve the user's intent and structure exactly
- Do NOT restructure or expand the prompt — only correct errors
- Never emit a correction whose before and after sides are identical after trimming — only flag real changes
- Show the smallest token that actually changed, not the whole surrounding phrase (e.g. "html → HTML", not "rather than single html → rather than a single HTML file")
- Surface at most 3 corrections per prompt; pick the ones most worth learning from

Output format (strict):
- If the prompt has NO errors, output EXACTLY: CLEAN
- If the prompt has errors, output the ENTIRE corrected prompt first — every line of it, preserving the user's line breaks and structure exactly. Then output a separator line containing exactly three equals signs: ===
  Then ONE correction per line in the format:
    {wrong} → {right} ({short category})
  where {short category} is one or two words such as: missing article, acronym capitalization, verb tense, word choice, spelling, apostrophe, preposition, punctuation, capitalization, agreement.
  Do not add bullet markers; do not wrap in parentheses; do not repeat the corrected sentence after the separator.

Example input:
"i seen the file but its missing comma
also plese check the test"
Example output:
I saw the file, but it's missing a comma.
Also, please check the test.
===
i → I (capitalization)
seen → saw (verb tense)
its → it's (apostrophe)`;

export const SYSTEM_TRANSLATE = `You are a translator for a developer who uses AI coding tools.
Rules:
- Translate the user's text into natural, idiomatic English
- Keep ALL technical terms, code references, file paths, and tool names unchanged
- Preserve the intent, structure, and line breaks exactly (a multi-line input gets a multi-line translation)
- Use imperative voice where appropriate for instructions
- Output the full English translation first, then on the very LAST line output only the detected source language in parentheses, e.g. (Chinese) or (Japanese)
- Output ONLY the translation and the language line, no commentary`;

export const SYSTEM_REFINE = `You are a prompt engineer. Rewrite the user's rough idea into a precise, effective prompt for an AI coding assistant.
Rules:
- Use imperative voice
- Be specific and actionable
- Add structure (numbered steps, categories) if the task is complex
- Expand vague requests into concrete instructions
- Keep technical terms intact
- Translate non-English to English
- Output ONLY the refined prompt, nothing else`;

// Minimal structural view of what we need from ExtensionContext, so this
// module doesn't depend on pi-coding-agent internals.
type ResolvedAuth =
  | { ok: true; apiKey?: string; headers?: Record<string, string>; env?: Record<string, string> }
  | { ok: false; error: string };

interface RegistryLike {
  find(provider: string, modelId: string): Model<Api> | undefined;
  getAvailable(): Model<Api>[];
  hasConfiguredAuth(model: Model<Api>): boolean;
  getApiKeyAndHeaders(model: Model<Api>): Promise<ResolvedAuth>;
}

export interface CoachHost {
  modelRegistry: RegistryLike;
  model?: Model<Api> | null;
}

/**
 * Pick the coach model: explicit config first, then the cheapest small model
 * pi has auth for (haiku/flash/mini/nano), then the session's current model.
 */
export function resolveCoachModel(host: CoachHost, config: EbConfig): Model<Api> | null {
  const registry = host.modelRegistry;

  if (config.model) {
    const slash = config.model.indexOf("/");
    if (slash > 0) {
      const model = registry.find(config.model.slice(0, slash), config.model.slice(slash + 1));
      if (model && registry.hasConfiguredAuth(model)) return model;
    }
  }

  const available = registry.getAvailable();
  for (const pattern of [/haiku/i, /flash/i, /mini/i, /nano/i]) {
    const model = available.find((m) => pattern.test(m.id));
    if (model) return model;
  }

  return host.model ?? null;
}

/**
 * Strip a hybrid-thinking model's reasoning block from plain-text output
 * (`<think>...</think>` or an unclosed `<think>` prefix).
 */
export function stripThinking(text: string): string {
  const closed = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (closed !== text.trim()) return closed;
  // Unclosed <think> at the start means the model never got to the answer.
  if (/^<think>/.test(text.trim())) return "";
  return text.trim();
}

/**
 * Direct OpenAI-compatible call for local servers (llama.cpp, MLX, LM Studio).
 * Bypasses pi-ai so we can force `chat_template_kwargs.enable_thinking:false` —
 * hybrid-thinking models (Qwen3.x) otherwise burn the whole token budget on
 * reasoning prose before emitting the correction. pi-ai only sends thinking
 * controls when the model is registered with `reasoning: true`.
 */
async function callOpenAICompat(
  model: Model<Api>,
  auth: { apiKey?: string; headers?: Record<string, string> },
  systemPrompt: string,
  userText: string,
  signal: AbortSignal,
): Promise<string> {
  const baseUrl = ((model as any).baseUrl as string).replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth.apiKey ? { Authorization: `Bearer ${auth.apiKey}` } : {}),
      ...(auth.headers ?? {}),
    },
    body: JSON.stringify({
      model: model.id,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      max_tokens: 800,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

/** Call the coach model. Returns trimmed text, or null on any failure/timeout. */
export async function callCoach(
  host: CoachHost,
  config: EbConfig,
  systemPrompt: string,
  userText: string,
): Promise<string | null> {
  const model = resolveCoachModel(host, config);
  if (!model) return null;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), config.timeoutMs);
  const startedAt = Date.now();
  try {
    const auth = await host.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth.ok) {
      debugLog(`coach: auth failed for ${model.provider}/${model.id}: ${auth.error}`);
      return null;
    }

    let text: string;
    if ((model as any).api === "openai-completions" && (model as any).baseUrl) {
      text = await callOpenAICompat(model, auth, systemPrompt, userText, abort.signal);
    } else {
      const response = await completeSimple(
        model,
        { systemPrompt, messages: [{ role: "user", content: userText, timestamp: Date.now() }] },
        { apiKey: auth.apiKey, headers: auth.headers, env: auth.env, maxTokens: 800, signal: abort.signal } as any,
      );
      text = response.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("")
        .trim();
    }

    text = stripThinking(text);
    debugLog(
      `coach: ${model.provider}/${model.id} ok in ${Date.now() - startedAt}ms, output=${JSON.stringify(text.slice(0, 300))}`,
    );
    return text || null;
  } catch (error) {
    debugLog(
      `coach: ${model.provider}/${model.id} FAILED after ${Date.now() - startedAt}ms (timeout=${config.timeoutMs}): ${error instanceof Error ? error.stack ?? error.message : String(error)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse the coach's annotation lines ("wrong → right (category)") into
 * structured pairs. Tolerates bullets, "->" arrows, and missing categories;
 * suppresses no-ops where both sides are identical after trimming.
 */
/**
 * Split coach output into the (possibly multi-line) corrected text and the
 * annotation block. Primary protocol: a `===` separator line. Fallback for
 * models that drop the separator: peel annotation-shaped lines off the end.
 */
export function splitCoachOutput(result: string): { corrected: string; annotationBlock: string } {
  const lines = result.split("\n");

  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*={3,}\s*$/.test(lines[i])) {
      return {
        corrected: lines.slice(0, i).join("\n").trim(),
        annotationBlock: lines.slice(i + 1).join("\n").trim(),
      };
    }
  }

  const looksLikeAnnotation = (l: string) => /^\s*(?:[-•*]\s*)?\S.*\s(?:→|->)\s.+/.test(l);
  let start = lines.length;
  while (start > 0 && (lines[start - 1].trim() === "" || looksLikeAnnotation(lines[start - 1]))) {
    start--;
  }
  if (start === 0) {
    // The whole output looks like annotations — no usable corrected text.
    return { corrected: "", annotationBlock: result.trim() };
  }
  return {
    corrected: lines.slice(0, start).join("\n").trim(),
    annotationBlock: lines.slice(start).join("\n").trim(),
  };
}

export function parseAnnotations(block: string, max: number): Annotation[] {
  if (!block) return [];
  // Small models sometimes copy the format template literally: "{plese} -> {please}".
  const unwrap = (s: string) =>
    s
      .trim()
      .replace(/^\{(.*)\}$/s, "$1")
      .replace(/^"(.*)"$/s, "$1")
      .trim();
  const out: Annotation[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.trim().replace(/^[-•*]\s*/, "");
    if (!line) continue;
    const match = line.match(/^(.+?)\s*(?:→|->)\s*(.+?)(?:\s*\(([^()]{1,60})\))?$/);
    if (!match) continue;
    const original = unwrap(match[1]);
    const corrected = unwrap(match[2]);
    const category = match[3]?.trim() ?? null;
    if (!original || !corrected || original === corrected) continue;
    if (category && /^no change/i.test(category)) continue;
    out.push({ original, corrected, category });
    if (out.length >= max) break;
  }
  return out;
}

export function correctSystemPrompt(config: EbConfig): string {
  const domainTerms =
    config.domainTerms.length > 0
      ? `\nAdditional domain terms to preserve unchanged: ${config.domainTerms.join(", ")}`
      : "";
  return SYSTEM_CORRECT + domainTerms;
}
