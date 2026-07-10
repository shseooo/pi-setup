// Config + correction history. Ported from claude-english-buddy scripts/lib/state.mjs.
// Storage: ~/.pi/english-buddy/config.json and ~/.pi/english-buddy/history/YYYY-MM-DD.jsonl

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface Annotation {
  original: string;
  corrected: string;
  category: string | null;
}

export type RecordMode = "correct" | "translate" | "refine" | "clean";

export interface HistoryRecord {
  ts: string;
  mode: RecordMode;
  original: string | null;
  corrected: string | null;
  /** Diff pairs for "correct" mode; source-language tag like "(Chinese)" for "translate". */
  annotations?: Annotation[] | string | null;
}

export interface EbConfig {
  /** Master switch for the whole extension. */
  enabled: boolean;
  /** Gates correct + translate. The `::` refine prefix works regardless. */
  autoCorrect: boolean;
  /** Coach model as "provider/model-id" (e.g. "anthropic/claude-haiku-4-5"). null = auto-pick a small model. */
  model: string | null;
  /** If set (e.g. "Korean"), ask the main agent to append a short summary in this language. */
  summaryLanguage: string | null;
  /** Also coach the argument text of slash commands (`/skill:foo <args>`); the command token is preserved. */
  coachSlashArgs: boolean;
  /** Technical terms the coach must never "correct". */
  domainTerms: string[];
  /** Max time to wait for the coach model before passing the prompt through unchanged. */
  timeoutMs: number;
  /** Max corrections surfaced per prompt. */
  maxAnnotations: number;
}

export const DEFAULT_CONFIG: EbConfig = {
  enabled: true,
  autoCorrect: true,
  model: null,
  summaryLanguage: null,
  coachSlashArgs: true,
  domainTerms: [],
  timeoutMs: 20_000,
  maxAnnotations: 3,
};

const DATA_DIR = path.join(os.homedir(), ".pi", "english-buddy");
const HISTORY_DIR = path.join(DATA_DIR, "history");
export const CONFIG_PATH = path.join(DATA_DIR, "config.json");
export const DEBUG_LOG_PATH = path.join(DATA_DIR, "debug.log");

/** Append a timestamped diagnostic line. Never throws. */
export function debugLog(message: string): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(DEBUG_LOG_PATH, `${new Date().toISOString()} ${message}\n`, "utf8");
  } catch {
    // diagnostics only
  }
}

export function loadConfig(): EbConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<EbConfig>) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: EbConfig): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function ensureHistoryDir(): string {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  return HISTORY_DIR;
}

function dateKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function dateFile(date: string): string {
  return path.join(HISTORY_DIR, `${date}.jsonl`);
}

export function logRecord(entry: Omit<HistoryRecord, "ts">): HistoryRecord {
  const record: HistoryRecord = { ts: new Date().toISOString(), ...entry };
  const file = path.join(ensureHistoryDir(), `${dateKey()}.jsonl`);
  fs.appendFileSync(file, JSON.stringify(record) + "\n", "utf8");
  return record;
}

export function logClean(): HistoryRecord {
  return logRecord({ mode: "clean", original: null, corrected: null });
}

export function readDay(date: string): HistoryRecord[] {
  const file = dateFile(date);
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as HistoryRecord;
      } catch {
        return null;
      }
    })
    .filter((r): r is HistoryRecord => r !== null);
}

export function readToday(): HistoryRecord[] {
  return readDay(dateKey());
}

export function listHistoryDates(): string[] {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  return fs
    .readdirSync(HISTORY_DIR)
    .filter((f) => f.endsWith(".jsonl"))
    .map((f) => f.replace(".jsonl", ""))
    .sort();
}

export function readLastNDays(n: number): HistoryRecord[] {
  const records: HistoryRecord[] = [];
  const day = new Date();
  for (let i = 0; i < n; i++) {
    records.push(...readDay(dateKey(day)));
    day.setDate(day.getDate() - 1);
  }
  return records;
}

export function readAll(): HistoryRecord[] {
  const records: HistoryRecord[] = [];
  for (const date of listHistoryDates()) {
    records.push(...readDay(date));
  }
  return records;
}
