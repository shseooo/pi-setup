import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Type } from "typebox";
import type {
  ExtensionAPI,
  ExtensionContext,
  ContextUsage,
} from "@earendil-works/pi-coding-agent";

/**
 * ctx-autocompact
 * --------------------------------------------------------------------------
 * Background context-usage watchdog.
 *
 * While the model is working, this extension periodically checks the active
 * model's context usage. When usage reaches the configured threshold
 * (default 90%) it proactively triggers a compaction.
 *
 * It does NOT implement its own summarization. It simply calls `ctx.compact()`,
 * which — because `pi-vcc-config.json` has `overrideDefaultCompaction: true` —
 * is handled by pi-vcc's algorithmic (no-LLM) compaction. pi-vcc keeps the
 * "kept tail" (everything from the last user message onward, i.e. the work
 * currently in progress) intact and only summarizes the older history.
 *
 * Triggering at 90% — proactively, with headroom to spare — is what keeps work
 * uninterrupted: it prevents the session from ever reaching pi's late
 * overflow-recovery compaction, which aborts and retries the in-flight turn.
 */

const STATUS_KEY = "ctx-autocompact";
const CONFIG_PATH = join(homedir(), ".pi", "agent", "ctx-autocompact-config.json");

interface Config {
  /** Master switch. */
  enabled: boolean;
  /** Usage % (0-100) at or above which compaction fires. */
  thresholdPercent: number;
  /** How often to poll context usage, in ms. */
  checkIntervalMs: number;
  /** Minimum gap between two compactions, in ms (debounce). */
  cooldownMs: number;
  /** Show a footer status with the live usage %. */
  showStatus: boolean;
  /** Emit a notification when a compaction is triggered. */
  notify: boolean;
  /**
   * If a compaction reclaims less than this % of tokens, treat it as
   * "tail-bound" (the bloat is in the live, un-compactable turn). The
   * watchdog then backs off until the next user prompt instead of looping.
   */
  minReclaimPercent: number;
  /**
   * After a compaction that interrupted active work, automatically send a
   * follow-up prompt so the agent resumes instead of halting. Only fires when
   * the compaction actually cut into a running turn (never when idle).
   */
  autoResume: boolean;
  /** The prompt sent to resume work after an interrupting compaction. */
  resumePrompt: string;
  /**
   * Auto-detect a successful `git commit` (a natural step boundary) and run a
   * keep:0 boundary compaction + resume — no agent tool call needed. Only fires
   * once context has grown past `commitCompactMinPercent`, so small sessions
   * don't compact on every commit.
   */
  compactOnCommit: boolean;
  /** Minimum usage % before a detected commit triggers boundary compaction. */
  commitCompactMinPercent: number;
  /** Regex (string) a bash command must match to count as a commit boundary. */
  commitPattern: string;
}

const DEFAULTS: Config = {
  enabled: true,
  thresholdPercent: 90,
  checkIntervalMs: 10_000,
  cooldownMs: 60_000,
  showStatus: true,
  notify: true,
  minReclaimPercent: 5,
  autoResume: true,
  resumePrompt:
    "컨텍스트가 자동 압축되었습니다. 작업을 처음부터 다시 시작하지 말고 중단된 지점에서 그대로 이어서 진행하세요. " +
    "다단계 계획을 따르던 중이라면(예: docs/PLAN.md 의 `RESUME:` 포인터) 그 파일을 다시 읽고 다음 미완료 단계부터 계속하세요. " +
    "압축으로 코딩 가이드라인도 컨텍스트에서 사라졌으므로, 구현 코드를 작성하기 전에 /skill:kg 를 다시 invoke 하고 따르세요.",
  compactOnCommit: true,
  commitCompactMinPercent: 50,
  commitPattern: "\\bgit\\b[\\s\\S]*?\\bcommit\\b",
};

export default function (pi: ExtensionAPI) {
  let config: Config = { ...DEFAULTS };

  // Session-scoped runtime state. Reset on every session_start.
  let timer: ReturnType<typeof setInterval> | null = null;
  let latestCtx: ExtensionContext | null = null;
  let compacting = false; // a compaction we triggered is in flight
  let lastCompactAt = 0; // epoch ms of the last completed/seen compaction
  // Set when a compaction reclaimed almost nothing → the bloat is in the live
  // tail, which pi-vcc won't touch. Suppress further attempts until a new user
  // prompt turns the current run into compactable history.
  let tailBound = false;
  // True when the compaction we triggered cut into a running turn → after it
  // completes we send a follow-up prompt so the agent resumes (auto-resume).
  let interruptedWork = false;
  // The follow-up prompt to resume with for the in-flight compaction (the tool
  // passes its own; background triggers fall back to config.resumePrompt).
  let pendingResumePrompt: string | null = null;

  function loadConfig(): Config {
    try {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      const parsed = JSON.parse(raw) as Partial<Config>;
      return { ...DEFAULTS, ...parsed };
    } catch {
      // Missing/invalid file → use defaults.
      return { ...DEFAULTS };
    }
  }

  /** Authoritative usage fraction (0..1), or null when unknown. */
  function usageFraction(usage: ContextUsage | undefined): number | null {
    if (!usage) return null;
    if (usage.tokens != null && usage.contextWindow > 0) {
      return usage.tokens / usage.contextWindow;
    }
    if (usage.percent != null) {
      // `percent` is documented as a percentage (0-100); normalize defensively.
      return usage.percent > 1 ? usage.percent / 100 : usage.percent;
    }
    return null;
  }

  function updateStatus(ctx: ExtensionContext, frac: number | null) {
    if (!config.showStatus) return;
    if (frac == null) {
      ctx.ui.setStatus(STATUS_KEY, compacting ? "ctx ⟳" : "ctx --%");
      return;
    }
    const pct = Math.round(frac * 100);
    const flag = compacting
      ? " ⟳"
      : tailBound
        ? " ⚠tail"
        : frac * 100 >= config.thresholdPercent
          ? " ⚠"
          : "";
    ctx.ui.setStatus(STATUS_KEY, `ctx ${pct}%${flag}`);
  }

  function triggerCompaction(
    ctx: ExtensionContext,
    opts: { keep?: number; resumePrompt?: string } = {},
  ) {
    if (compacting) return;
    compacting = true;
    // keep:0 compacts the tail too, so any prior tail-bound backoff is moot.
    if (opts.keep === 0) tailBound = false;
    // Capture, before compaction can abort it, whether a turn was running.
    // Only then do we auto-resume afterwards.
    interruptedWork = config.autoResume && !ctx.isIdle();
    pendingResumePrompt = opts.resumePrompt ?? config.resumePrompt;
    lastCompactAt = Date.now(); // start cooldown immediately to debounce
    if (config.notify) {
      ctx.ui.notify(
        opts.keep != null
          ? `ctx-autocompact: compacting (keep:${opts.keep}) — current work ${opts.keep === 0 ? "included" : "preserved"}.`
          : `ctx-autocompact: usage ≥ ${config.thresholdPercent}% — compacting older history (pi-vcc), current work preserved.`,
        "info",
      );
    }
    ctx.ui.setStatus(STATUS_KEY, "ctx ⟳ compacting");

    // pi-vcc reads `keep:N` from customInstructions; omit to use its default
    // (keep:1, current work preserved). keep:0 compacts the tail too.
    const compactOptions: Parameters<ExtensionContext["compact"]>[0] =
      opts.keep != null ? { customInstructions: `keep:${opts.keep}` } : {};

    ctx.compact({
      ...compactOptions,
      onComplete: (result) => {
        compacting = false;
        lastCompactAt = Date.now();
        const before = result?.tokensBefore;
        const after = result?.estimatedTokensAfter;
        if (typeof before === "number" && typeof after === "number" && before > 0) {
          const saved = Math.max(0, before - after);
          const reclaimedPct = (saved / before) * 100;
          // Ineffective compaction → bloat lives in the un-compactable tail.
          if (reclaimedPct < config.minReclaimPercent) {
            tailBound = true;
            if (config.notify) {
              ctx.ui.notify(
                "ctx-autocompact: 압축해도 회수량이 미미합니다 — 부피가 현재 진행 중인 turn(tail)에 " +
                  "있어 pi-vcc가 줄일 수 없습니다. 다음 프롬프트까지 자동 압축을 보류합니다. " +
                  "(tool 출력은 context-mode로 줄이는 것을 권장)",
                "warning",
              );
            }
          } else if (config.notify) {
            ctx.ui.notify(
              `ctx-autocompact: compacted ${before.toLocaleString()} → ~${after.toLocaleString()} tokens (-${saved.toLocaleString()}).`,
              "info",
            );
          }
        } else if (config.notify && typeof before === "number") {
          ctx.ui.notify(`ctx-autocompact: compacted (was ${before.toLocaleString()} tokens).`, "info");
        }
        updateStatus(ctx, usageFraction(ctx.getContextUsage()));
        maybeResume(ctx);
      },
      onError: (error) => {
        compacting = false;
        const benign = /nothing to compact|too small/i.test(error.message ?? "");
        if (config.notify) {
          ctx.ui.notify(
            benign
              ? "ctx-autocompact: 압축할 내용이 없어 그대로 작업을 이어갑니다."
              : `ctx-autocompact: compaction failed — ${error.message}`,
            benign ? "info" : "error",
          );
        }
        // Compaction failed → context is unchanged, but if we interrupted a
        // running turn we must still resume, or the work halts. Never leave the
        // agent stuck just because there was nothing to compact.
        maybeResume(ctx);
      },
    });
  }

  /**
   * After a compaction that interrupted active work, nudge the agent to resume.
   * Guarded so we never spawn a spurious turn: only when we flagged an
   * interruption, the agent is now idle, and nothing else is already queued.
   */
  function maybeResume(ctx: ExtensionContext) {
    const prompt = pendingResumePrompt ?? config.resumePrompt;
    pendingResumePrompt = null;
    if (!interruptedWork) return;
    interruptedWork = false;
    if (!ctx.isIdle()) return; // compaction didn't actually halt the turn
    if (ctx.hasPendingMessages()) return; // user/skill already queued a follow-up
    if (config.notify) {
      ctx.ui.notify("ctx-autocompact: 압축 완료 — 작업을 자동으로 이어서 재개합니다.", "info");
    }
    pi.sendUserMessage(prompt, { deliverAs: "followUp" });
  }

  /** Core watchdog tick. Safe to call from the timer or from event handlers. */
  function check(ctx: ExtensionContext) {
    latestCtx = ctx;
    if (!config.enabled) return;

    const usage = ctx.getContextUsage();
    const frac = usageFraction(usage);
    updateStatus(ctx, frac);

    if (compacting) return; // already working on one
    if (frac == null) return; // usage unknown (e.g. just after a compaction)
    if (frac * 100 < config.thresholdPercent) return; // below threshold
    if (tailBound) return; // last attempt was futile; wait for next user prompt

    // Debounce: don't stack compactions back-to-back.
    if (Date.now() - lastCompactAt < config.cooldownMs) return;

    triggerCompaction(ctx);
  }

  function startTimer() {
    stopTimer();
    timer = setInterval(() => {
      if (latestCtx) check(latestCtx);
    }, config.checkIntervalMs);
    // Don't keep the process alive solely for this timer.
    (timer as { unref?: () => void }).unref?.();
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  // -- Agent-callable tool: compact at a safe boundary, then auto-resume -----
  // Slash commands (/pi-vcc, /compact) CANNOT be invoked by the agent — they
  // are user/TUI commands, and the model will fail trying to run them in bash.
  // This tool is the agent-facing equivalent: it triggers pi-vcc compaction and
  // resumes the work itself, so workflows (e.g. the plan-tasks skill) can free
  // context between steps without halting.
  pi.registerTool({
    name: "compact_and_continue",
    label: "Compact & Continue",
    promptSnippet:
      "Use compact_and_continue to free context at a safe boundary (state already on disk) and auto-resume the work.",
    description:
      "Compact the conversation to free context, then automatically resume the work. " +
      "Call this ONLY at a safe boundary where everything needed to continue is already saved to disk " +
      "(e.g. after a plan-tasks step is committed and PLAN.md/RESUME are updated). " +
      "With keep=0 (default) it compacts the entire history INCLUDING the current step's chatter — safe only " +
      "because the resume state is on disk. After calling this, end your turn; you will be re-prompted " +
      "automatically with the follow-up to continue. Do NOT try to run /pi-vcc or /compact as a shell command — " +
      "they are not shell commands; use this tool instead.",
    promptGuidelines: [
      "To free context between steps, call the compact_and_continue tool — never run /pi-vcc or /compact in bash.",
    ],
    parameters: Type.Object({
      followUp: Type.Optional(
        Type.String({
          description:
            "One-line instruction to resume with after compaction (e.g. 're-read docs/PLAN.md and continue from the RESUME step'). Defaults to the configured resume prompt.",
        }),
      ),
      keep: Type.Optional(
        Type.Integer({
          minimum: 0,
          description:
            "How many trailing user turns to preserve uncompacted. 0 (default) compacts everything; use >0 only if recent live conversation must be kept.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const keep = typeof params.keep === "number" ? params.keep : 0;
      const followUp =
        typeof params.followUp === "string" && params.followUp.trim()
          ? params.followUp.trim()
          : config.resumePrompt;
      triggerCompaction(ctx, { keep, resumePrompt: followUp });
      return {
        content: [
          {
            type: "text",
            text:
              `Compaction scheduled (keep:${keep}). End this turn now — the session will be compacted and ` +
              `you will be re-prompted automatically to continue:\n"${followUp}"`,
          },
        ],
      };
    },
  });

  // -- Lifecycle ------------------------------------------------------------

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig();
    latestCtx = ctx;
    compacting = false;
    lastCompactAt = 0;
    // Make sure the agent-callable tool is in the active set (additive — never
    // drops other tools), so the LLM can actually call it.
    try {
      const active = pi.getActiveTools();
      if (!active.includes("compact_and_continue")) {
        pi.setActiveTools([...active, "compact_and_continue"]);
      }
    } catch {
      // getActiveTools/setActiveTools unavailable in this mode — ignore.
    }
    if (config.enabled) {
      startTimer();
      check(ctx);
    } else {
      stopTimer();
    }
  });

  pi.on("session_shutdown", async () => {
    stopTimer();
    latestCtx = null;
  });

  // Keep `latestCtx` fresh and opportunistically check at natural boundaries
  // (these fire frequently during a turn, so the watchdog reacts faster than
  // the poll interval while the model is actively working).
  // A new user prompt makes the previous (possibly bloated) run compactable
  // history again, so clear the tail-bound backoff and re-arm the watchdog.
  pi.on("before_agent_start", async (_event, ctx) => {
    tailBound = false;
    latestCtx = ctx;
  });

  pi.on("turn_end", async (_event, ctx) => check(ctx));
  pi.on("message_end", async (event, ctx) => {
    if (event.message.role === "assistant") check(ctx);
  });

  // Auto-detect a successful `git commit` — a natural step boundary — and run a
  // keep:0 boundary compaction + resume, so workflows like plan-tasks free
  // context between steps without the agent having to call a tool.
  pi.on("tool_result", async (event, ctx) => {
    latestCtx = ctx;
    if (!config.enabled || !config.compactOnCommit) return;
    if (compacting) return;
    if (event.toolName !== "bash" || event.isError) return;

    const command = typeof event.input?.command === "string" ? event.input.command : "";
    if (!command) return;
    // Exclude read-only / dry-run git verbs that merely mention "commit".
    if (/--dry-run|commit-tree|commit-graph/.test(command)) return;
    if (/\bgit\s+(log|show|diff|status|rev-list|reflog|grep|cat-file)\b/.test(command)) return;
    let re: RegExp;
    try {
      re = new RegExp(config.commitPattern);
    } catch {
      return; // invalid user regex → disable detection rather than crash
    }
    if (!re.test(command)) return;

    // Boundary detected — but only compact once context has actually grown,
    // so small early sessions don't compact on every commit (and we avoid the
    // "nothing to compact" path).
    const frac = usageFraction(ctx.getContextUsage());
    if (frac == null || frac * 100 < config.commitCompactMinPercent) return;
    if (Date.now() - lastCompactAt < config.cooldownMs) return;

    if (config.notify) {
      ctx.ui.notify(
        `ctx-autocompact: git commit 감지 (usage ${Math.round(frac * 100)}%) — 단계 경계 압축(keep:0) 후 자동 재개.`,
        "info",
      );
    }
    triggerCompaction(ctx, { keep: 0, resumePrompt: config.resumePrompt });
  });

  // If a compaction happens through any path, sync our debounce/flag state.
  pi.on("session_compact", async (_event, ctx) => {
    compacting = false;
    lastCompactAt = Date.now();
    updateStatus(ctx, usageFraction(ctx.getContextUsage()));
  });

  // -- Manual control: /ctx-autocompact [status|on|off|now|set <pct>] --------

  pi.registerCommand("ctx-autocompact", {
    description:
      "Background context watchdog: auto-compacts older history (pi-vcc) at a usage threshold",
    getArgumentCompletions: (prefix: string) => {
      const items = ["status", "on", "off", "now", "set "].map((v) => ({
        value: v,
        label: v.trim(),
      }));
      const filtered = items.filter((i) => i.value.startsWith(prefix));
      return filtered.length > 0 ? filtered : null;
    },
    handler: async (args, ctx) => {
      const [sub, ...rest] = args.trim().split(/\s+/);
      const usage = ctx.getContextUsage();
      const frac = usageFraction(usage);
      const pct = frac == null ? "?" : `${Math.round(frac * 100)}%`;

      switch (sub) {
        case "on":
          config.enabled = true;
          tailBound = false;
          startTimer();
          ctx.ui.notify("ctx-autocompact: enabled.", "info");
          break;
        case "off":
          config.enabled = false;
          stopTimer();
          ctx.ui.setStatus(STATUS_KEY, "ctx off");
          ctx.ui.notify("ctx-autocompact: disabled.", "info");
          break;
        case "now":
          tailBound = false;
          ctx.ui.notify(`ctx-autocompact: forcing compaction (current usage ${pct}).`, "info");
          triggerCompaction(ctx);
          break;
        case "set": {
          const n = Number(rest[0]);
          if (!Number.isFinite(n) || n <= 0 || n > 100) {
            ctx.ui.notify("Usage: /ctx-autocompact set <1-100>", "error");
            break;
          }
          config.thresholdPercent = n;
          ctx.ui.notify(`ctx-autocompact: threshold set to ${n}%.`, "info");
          break;
        }
        case "":
        case undefined:
        case "status":
        default:
          ctx.ui.notify(
            `ctx-autocompact — ${config.enabled ? "ON" : "OFF"} | usage ${pct} | ` +
              `threshold ${config.thresholdPercent}% | poll ${config.checkIntervalMs / 1000}s | ` +
              `cooldown ${config.cooldownMs / 1000}s${compacting ? " | compacting…" : ""}` +
              `${tailBound ? " | tail-bound (다음 프롬프트까지 보류)" : ""}`,
            "info",
          );
          break;
      }
    },
  });
}
