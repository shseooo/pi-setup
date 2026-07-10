// english-buddy — pi port of xiaolai/claude-english-buddy-for-claude.
// ---------------------------------------------------------------------------
// English language coach for non-native speakers:
//   • Every typed prompt is checked by a small "coach" model before the agent
//     sees it: English gets minimally corrected, non-English gets translated,
//     and a `::` prefix asks for a full prompt-engineering rewrite.
//   • The corrected text is what the agent receives (input transform); a card
//     in the transcript shows exactly what changed so you learn from it.
//   • Every correction is logged to ~/.pi/english-buddy/history/*.jsonl.
//   • /eb today | stats | mistakes | drill | review | preview | on | off | config
//
// The coach never blocks you: on any failure or timeout the original prompt
// passes through unchanged.

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Box, Text } from "@earendil-works/pi-tui";
import { detectMode } from "./detect";
import {
  callCoach,
  correctSystemPrompt,
  parseAnnotations,
  resolveCoachModel,
  splitCoachOutput,
  SYSTEM_REFINE,
  SYSTEM_TRANSLATE,
} from "./coach";
import {
  CONFIG_PATH,
  DEFAULT_CONFIG,
  debugLog,
  loadConfig,
  logClean,
  logRecord,
  readDay,
  readToday,
  readAll,
  readLastNDays,
  saveConfig,
  type Annotation,
  type EbConfig,
} from "./state";
import { categoryTotals, periodStats, topPatterns, weeklyTrend } from "./stats";

const STATUS_KEY = "english-buddy";

interface CardData {
  kind: "correct" | "translate" | "refine" | "preview";
  original: string;
  corrected: string;
  annotations: Annotation[];
  sourceLang?: string;
}

interface ReportData {
  title: string;
  lines: string[];
}

export default function (pi: ExtensionAPI) {
  let config: EbConfig = loadConfig();
  let warnedNoModel = false;

  // ---------------------------------------------------------------- helpers

  function safeFg(theme: any, color: string, text: string): string {
    try {
      return theme.fg(color, text);
    } catch {
      return text;
    }
  }

  function safeBold(theme: any, text: string): string {
    try {
      return theme.bold(text);
    } catch {
      return text;
    }
  }

  function updateFooter(ctx: ExtensionContext | any): void {
    try {
      if (!config.enabled) {
        ctx.ui.setStatus(STATUS_KEY, undefined);
        return;
      }
      const records = readToday();
      const fixed = records.filter((r) => r.mode !== "clean").length;
      const paused = config.autoCorrect ? "" : " (off)";
      ctx.ui.setStatus(STATUS_KEY, `✎ EB ${fixed}/${records.length}${paused}`);
    } catch {
      // Footer is cosmetic — never let it break the turn.
    }
  }

  // Cards are custom messages so they render in the transcript via
  // registerMessageRenderer. They would normally also enter LLM context, so a
  // "context" handler below strips every eb-* message before the LLM call.
  function showCard(data: CardData): void {
    const plain = [
      ...(data.original ? [`you: ${data.original}`] : []),
      data.corrected,
      ...(data.annotations ?? []).map((a) => `${a.original} → ${a.corrected}${a.category ? ` (${a.category})` : ""}`),
    ].join("\n");
    pi.sendMessage({ customType: "eb-card", content: plain, display: true, details: data });
  }

  function showReport(title: string, lines: string[]): void {
    pi.sendMessage({
      customType: "eb-report",
      content: [title, ...lines].join("\n"),
      display: true,
      details: { title, lines } satisfies ReportData,
    });
  }

  // -------------------------------------------------------------- renderers

  const line = (text: string) => new Text(text, 0, 0);

  pi.registerMessageRenderer("eb-card", (message: any, _opts: any, theme: any) => {
    const data = (message.details ?? {}) as CardData;
    const box = new Box(1, 0);
    const icon =
      data.kind === "translate" ? "🌐" : data.kind === "refine" ? "✨" : data.kind === "preview" ? "🔍" : "✎";
    const label =
      data.kind === "translate"
        ? `Translated ${data.sourceLang ?? ""}`.trim()
        : data.kind === "refine"
          ? "Refined"
          : data.kind === "preview"
            ? "Preview (not sent)"
            : "English Buddy";
    const correctedLines = (data.corrected ?? "").split("\n");
    if (data.original) {
      const originalLines = data.original.split("\n");
      box.addChild(line(safeFg(theme, "dim", `you: ${originalLines[0]}`)));
      for (const l of originalLines.slice(1)) box.addChild(line(safeFg(theme, "dim", `     ${l}`)));
    }
    box.addChild(line(`${icon} ${safeFg(theme, "dim", label + ":")} ${safeBold(theme, correctedLines[0])}`));
    for (const l of correctedLines.slice(1)) box.addChild(line(`   ${safeBold(theme, l)}`));
    for (const a of data.annotations ?? []) {
      const category = a.category ? safeFg(theme, "dim", `  (${a.category})`) : "";
      box.addChild(line(`   • ${a.original} → ${a.corrected}${category}`));
    }
    return box;
  });

  pi.registerMessageRenderer("eb-report", (message: any, _opts: any, theme: any) => {
    const data = (message.details ?? {}) as ReportData;
    const box = new Box(1, 0);
    box.addChild(line(safeBold(theme, `✎ ${data.title}`)));
    for (const l of data.lines ?? []) {
      box.addChild(line(l));
    }
    return box;
  });

  // ------------------------------------------------------------ core events

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    updateFooter(ctx);
  });

  // Keep our display-only cards out of the LLM context, and let only the most
  // recent summary-language note through (they are injected once per turn and
  // would otherwise pile up in context).
  pi.on("context", async (event: any) => {
    const messages = event.messages;
    let lastNote = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "custom" && m.customType === "eb-note") {
        lastNote = i;
        break;
      }
    }
    const filtered = messages.filter((m: any, i: number) => {
      if (m.role !== "custom") return true;
      if (m.customType === "eb-card" || m.customType === "eb-report") return false;
      if (m.customType === "eb-note") return i === lastNote;
      return true;
    });
    if (filtered.length !== messages.length) {
      return { messages: filtered };
    }
  });

  // Optional summary-language feature (port of `summary_language`): ask the
  // main agent to append a short summary in the user's native language. The
  // instruction is injected as a per-turn message (converted to a user-role
  // note right next to the prompt) — appending it to the tail of pi's large
  // system prompt proved too weak for local models to follow reliably.
  pi.on("before_agent_start", async () => {
    if (!config.enabled || !config.summaryLanguage) return;
    return {
      message: {
        customType: "eb-note",
        content:
          `After your response, add a brief summary in ${config.summaryLanguage} under a --- separator. ` +
          `Summarize the key points, actions taken, and decisions made. Keep it concise (2-5 sentences). ` +
          `Label it: **${config.summaryLanguage} Summary**`,
        display: false,
      },
    };
  });

  pi.on("input", async (event: any, ctx) => {
    if (!config.enabled) return;
    // Only coach text the human actually typed — never RPC or extension-injected messages.
    if (event.source && event.source !== "interactive") return;

    const detection = detectMode(event.text ?? "", { slashArgs: config.coachSlashArgs });
    if (detection.mode === "skip") return;
    if (detection.mode !== "refine" && !config.autoCorrect) return;
    const prefix = detection.prefix ?? "";

    const coachModel = resolveCoachModel(ctx as any, config);
    debugLog(
      `input: mode=${detection.mode} source=${event.source} len=${(event.text ?? "").length} coachModel=${coachModel ? `${coachModel.provider}/${coachModel.id}` : "NONE"}`,
    );
    if (!coachModel) {
      if (!warnedNoModel) {
        warnedNoModel = true;
        ctx.ui.notify("english-buddy: no coach model with auth available — corrections disabled", "warning");
      }
      return;
    }

    const verb =
      detection.mode === "refine" ? "refining…" : detection.mode === "translate" ? "translating…" : "checking…";
    ctx.ui.setStatus(STATUS_KEY, `✎ EB ${verb}`);

    try {
      if (detection.mode === "refine") {
        if (!detection.text) {
          ctx.ui.notify("Nothing to refine. Provide text after ::", "warning");
          return { action: "handled" };
        }
        const refined = await callCoach(ctx as any, config, SYSTEM_REFINE, detection.text);
        if (!refined) {
          ctx.ui.notify("english-buddy: refinement failed — sending your text as-is", "warning");
          return { action: "transform", text: detection.text };
        }
        logRecord({ mode: "refine", original: detection.text, corrected: refined });
        showCard({ kind: "refine", original: detection.text, corrected: refined, annotations: [] });
        return { action: "transform", text: refined };
      }

      if (detection.mode === "translate") {
        const result = await callCoach(ctx as any, config, SYSTEM_TRANSLATE, detection.text);
        if (!result) return; // pass through unchanged

        // Full translation (may be multi-line); the last line is the "(Language)" tag.
        const lines = result.split("\n");
        let sourceLang = "";
        for (let i = lines.length - 1; i >= 0; i--) {
          const trimmed = lines[i].trim();
          if (!trimmed) continue;
          if (/^\([^()]{2,30}\)$/.test(trimmed)) {
            sourceLang = trimmed;
            lines.splice(i, 1);
          }
          break;
        }
        const translated = lines.join("\n").trim();
        if (!translated) return;

        logRecord({ mode: "translate", original: detection.text, corrected: translated, annotations: sourceLang });
        showCard({
          kind: "translate",
          original: prefix + detection.text,
          corrected: prefix + translated,
          annotations: [],
          sourceLang,
        });
        return { action: "transform", text: prefix + translated };
      }

      // mode === "correct"
      const result = await callCoach(ctx as any, config, correctSystemPrompt(config), detection.text);
      if (!result) return; // pass through unchanged

      if (result === "CLEAN") {
        logClean();
        return;
      }

      const { corrected, annotationBlock } = splitCoachOutput(result);
      const annotations = parseAnnotations(annotationBlock, config.maxAnnotations);

      // Zero real corrections, or a "corrected" text identical to the input →
      // treat as clean rather than logging a misleading entry.
      if (!corrected || annotations.length === 0 || corrected === detection.text.trim()) {
        logClean();
        return;
      }

      logRecord({ mode: "correct", original: detection.text, corrected, annotations });
      showCard({ kind: "correct", original: prefix + detection.text, corrected: prefix + corrected, annotations });
      return { action: "transform", text: prefix + corrected };
    } finally {
      updateFooter(ctx);
    }
  });

  // --------------------------------------------------------------- reports

  function buildTodayReport(): ReportData {
    const today = readToday();
    const stats = periodStats(today);
    if (stats.total === 0) {
      return { title: "Today", lines: ["No prompts processed today yet."] };
    }

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStats = periodStats(readDay(yesterday.toISOString().slice(0, 10)));
    const week = periodStats(readLastNDays(7));

    const lines: string[] = [];
    lines.push(
      `Prompts: ${stats.total}   corrections: ${stats.corrections}   translations: ${stats.translations}   refinements: ${stats.refinements}   clean: ${stats.clean}`,
    );
    lines.push(
      `Error rate: ${stats.errorRate}%   (yesterday: ${yStats.total > 0 ? `${yStats.errorRate}% of ${yStats.total}` : "no data"}, 7-day: ${week.errorRate}% of ${week.total})`,
    );

    const recurring = topPatterns(today, 5).filter((p) => p.count >= 2);
    if (recurring.length > 0) {
      lines.push("Recurring today:");
      for (const p of recurring) {
        lines.push(`  • ${p.original} → ${p.corrected}  ${p.count}x${p.category ? `  (${p.category})` : ""}`);
      }
    }

    const recent = today.filter((r) => r.mode === "correct").slice(-5);
    if (recent.length > 0) {
      lines.push("Recent fixes:");
      for (const r of recent) {
        for (const a of r.annotations && typeof r.annotations !== "string" ? r.annotations : []) {
          lines.push(`  • ${a.original} → ${a.corrected}${a.category ? `  (${a.category})` : ""}`);
        }
      }
    }
    return { title: "Today", lines };
  }

  function buildStatsReport(days: number): ReportData {
    const records = readLastNDays(days);
    const stats = periodStats(records);
    if (stats.total === 0) {
      return { title: `Stats (${days} days)`, lines: ["No history yet."] };
    }

    const lines: string[] = [];
    lines.push(
      `Prompts: ${stats.total}   corrections: ${stats.corrections}   translations: ${stats.translations}   error rate: ${stats.errorRate}%`,
    );

    const trend = weeklyTrend(4).filter((w) => w.total > 0);
    if (trend.length > 0) {
      lines.push("Weekly trend (fix rate):");
      for (const w of trend) {
        lines.push(`  ${w.label}:  ${w.rate}%  (${w.fixed}/${w.total})`);
      }
    }

    const patterns = topPatterns(records, 10);
    if (patterns.length > 0) {
      lines.push(`Top mistakes (${days} days):`);
      patterns.forEach((p, i) => {
        lines.push(`  ${i + 1}. ${p.original} → ${p.corrected}  ${p.count}x${p.category ? `  (${p.category})` : ""}`);
      });
    }
    return { title: `Stats (last ${days} days)`, lines };
  }

  function buildMistakesReport(topN: number): ReportData {
    const records = readAll();
    const stats = periodStats(records);
    const patterns = topPatterns(records, topN);
    if (patterns.length === 0) {
      return { title: "Recurring Mistakes", lines: ["No corrections recorded yet."] };
    }

    const lines: string[] = [];
    lines.push(`All time: ${stats.total} prompts, ${stats.corrections} corrections`);
    lines.push(`Top ${patterns.length} patterns:`);
    patterns.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${p.original} → ${p.corrected}  ${p.count}x${p.category ? `  (${p.category})` : ""}`);
    });

    const cats = categoryTotals(patterns).slice(0, 3);
    if (cats.length > 0) {
      lines.push("Focus areas: " + cats.map((c) => `${c.category} (${c.count})`).join(", "));
    }
    return { title: "Recurring Mistakes", lines };
  }

  function buildConfigReport(): ReportData {
    return {
      title: "Config",
      lines: [
        `enabled: ${config.enabled}`,
        `autoCorrect: ${config.autoCorrect}`,
        `model: ${config.model ?? "(auto — smallest available)"}`,
        `summaryLanguage: ${config.summaryLanguage ?? "(off)"}`,
        `coachSlashArgs: ${config.coachSlashArgs}`,
        `domainTerms: ${config.domainTerms.length > 0 ? config.domainTerms.join(", ") : "(none)"}`,
        `timeoutMs: ${config.timeoutMs}   maxAnnotations: ${config.maxAnnotations}`,
        `file: ${CONFIG_PATH}`,
        `set with: /eb config set <key> <value>`,
      ],
    };
  }

  function setConfigValue(key: string, rawValue: string): string {
    const value = rawValue.trim();
    switch (key) {
      case "enabled":
      case "autoCorrect":
      case "coachSlashArgs":
        (config as any)[key] = value === "true" || value === "on" || value === "1";
        break;
      case "model":
      case "summaryLanguage":
        (config as any)[key] = value === "null" || value === "off" || value === "" ? null : value;
        break;
      case "domainTerms":
        config.domainTerms = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        break;
      case "timeoutMs":
      case "maxAnnotations": {
        const n = Number.parseInt(value, 10);
        if (Number.isNaN(n) || n <= 0) return `Invalid number: ${value}`;
        (config as any)[key] = n;
        break;
      }
      default:
        return `Unknown key: ${key}. Keys: ${Object.keys(DEFAULT_CONFIG).join(", ")}`;
    }
    saveConfig(config);
    return `Saved ${key}.`;
  }

  // ---------------------------------------------------------- main command

  const SUBCOMMANDS = ["today", "stats", "mistakes", "drill", "review", "preview", "on", "off", "config"];

  pi.registerCommand("eb", {
    description: "English Buddy — today | stats [days] | mistakes [top] | drill | review [text] | preview <text> | on | off | config",
    getArgumentCompletions: (prefix: string) => {
      const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s }));
      return items.length > 0 ? items : null;
    },
    handler: async (args: string, ctx: any) => {
      const trimmed = (args ?? "").trim();
      const sub = (trimmed.split(/\s+/)[0] || "today").toLowerCase();
      const rest = trimmed.slice(sub.length).trim();

      switch (sub) {
        case "today": {
          const report = buildTodayReport();
          showReport(report.title, report.lines);
          break;
        }

        case "stats": {
          const days = Number.parseInt(rest, 10) || 30;
          const report = buildStatsReport(days);
          showReport(report.title, report.lines);
          break;
        }

        case "mistakes": {
          const topN = Number.parseInt(rest, 10) || 20;
          const report = buildMistakesReport(topN);
          showReport(report.title, report.lines);
          break;
        }

        case "drill": {
          const patterns = topPatterns(readAll(), 10);
          if (patterns.length === 0) {
            ctx.ui.notify("No correction history yet — nothing to drill.", "info");
            break;
          }
          if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
            ctx.ui.notify("Agent is busy — run /eb drill when it's idle.", "warning");
            break;
          }
          const list = patterns
            .map((p) => `- "${p.original}" → "${p.corrected}" (${p.category ?? "uncategorized"}, ${p.count}x)`)
            .join("\n");
          pi.sendUserMessage(
            `[english-buddy drill] I am a non-native English speaker practicing my recurring mistakes. ` +
              `My most frequent corrections so far:\n${list}\n\n` +
              `Run a short drill: write 5 fill-in-the-blank or choose-the-correct-form sentences that target the ` +
              `categories above (do NOT reuse my exact sentences). Present all 5 at once, numbered, and wait for my ` +
              `answers. After I answer, grade each one, explain the underlying rule briefly for any I got wrong, ` +
              `and give me a score out of 5. Keep the whole thing compact.`,
          );
          break;
        }

        case "review": {
          const text = rest || (await ctx.ui.editor("Text to review:", ""));
          if (!text || text.trim().length < 10) {
            ctx.ui.notify("Nothing to review (need at least 10 characters).", "warning");
            break;
          }
          if (typeof ctx.isIdle === "function" && !ctx.isIdle()) {
            ctx.ui.notify("Agent is busy — run /eb review when it's idle.", "warning");
            break;
          }
          pi.sendUserMessage(
            `[english-buddy review] Review the following text as an English writing coach for a non-native speaker. ` +
              `Principles: preserve my voice (do not rewrite my style into yours), be minimally invasive (fix errors, ` +
              `not preferences), and do not over-polish casual text. Report: (1) corrected version, (2) each change as ` +
              `"wrong → right (category)" with a one-line why, (3) any awkward-but-valid phrasings with a more natural ` +
              `alternative, clearly marked optional. Text follows:\n\n${text}`,
          );
          break;
        }

        case "preview": {
          const text = rest || (await ctx.ui.editor("Text to preview:", ""));
          if (!text || text.trim().length < 10) {
            ctx.ui.notify("Input too short to preview.", "warning");
            break;
          }
          ctx.ui.setStatus(STATUS_KEY, "✎ EB previewing…");
          const result = await callCoach(ctx, config, correctSystemPrompt(config), text);
          if (!result) {
            ctx.ui.notify("Preview failed (coach model unavailable).", "error");
          } else if (result === "CLEAN") {
            showCard({ kind: "preview", original: text, corrected: text + "  (clean — no changes)", annotations: [] });
          } else {
            const { corrected, annotationBlock } = splitCoachOutput(result);
            const annotations = parseAnnotations(annotationBlock, config.maxAnnotations);
            showCard({ kind: "preview", original: text, corrected: corrected || result, annotations });
          }
          break;
        }

        case "on":
        case "off": {
          config.enabled = true;
          config.autoCorrect = sub === "on";
          saveConfig(config);
          ctx.ui.notify(`english-buddy auto-correction ${sub === "on" ? "enabled" : "paused"} (:: refine still works)`, "info");
          break;
        }

        case "config": {
          if (rest.startsWith("set ")) {
            const parts = rest.slice(4).trim().split(/\s+/);
            const key = parts[0];
            const value = parts.slice(1).join(" ");
            const message = setConfigValue(key, value);
            ctx.ui.notify(message, message.startsWith("Saved") ? "info" : "warning");
          }
          const report = buildConfigReport();
          showReport(report.title, report.lines);
          break;
        }

        default:
          ctx.ui.notify(`Unknown subcommand: ${sub}. Try: ${SUBCOMMANDS.join(", ")}`, "warning");
      }
      updateFooter(ctx);
    },
  });
}
