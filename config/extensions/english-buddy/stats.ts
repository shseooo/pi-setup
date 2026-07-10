// Trend analysis and pattern extraction over the JSONL history.
// Ported from claude-english-buddy scripts/lib/stats.mjs (reimplemented in TS).

import { readDay, readLastNDays, type Annotation, type HistoryRecord } from "./state";

export interface PeriodStats {
  total: number;
  corrections: number;
  translations: number;
  refinements: number;
  clean: number;
  errorRate: number; // % of prompts that needed any fix
}

export interface Pattern {
  original: string;
  corrected: string;
  category: string | null;
  count: number;
}

export function annotationsOf(record: HistoryRecord): Annotation[] {
  if (!record.annotations || typeof record.annotations === "string") return [];
  return record.annotations;
}

export function periodStats(records: HistoryRecord[]): PeriodStats {
  const total = records.length;
  const corrections = records.filter((r) => r.mode === "correct").length;
  const translations = records.filter((r) => r.mode === "translate").length;
  const refinements = records.filter((r) => r.mode === "refine").length;
  const clean = records.filter((r) => r.mode === "clean").length;
  const fixed = corrections + translations;
  return {
    total,
    corrections,
    translations,
    refinements,
    clean,
    errorRate: total > 0 ? Math.round((fixed / total) * 100) : 0,
  };
}

/** Bucket corrections by case-insensitive (original, corrected) pair. */
export function topPatterns(records: HistoryRecord[], topN: number): Pattern[] {
  const buckets = new Map<string, Pattern>();
  for (const record of records) {
    if (record.mode !== "correct") continue;
    for (const fix of annotationsOf(record)) {
      const key = `${fix.original.toLowerCase()}|${fix.corrected.toLowerCase()}`;
      const entry = buckets.get(key) ?? { ...fix, count: 0 };
      entry.count += 1;
      if (!entry.category && fix.category) entry.category = fix.category;
      buckets.set(key, entry);
    }
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, topN);
}

export function categoryTotals(patterns: Pattern[]): Array<{ category: string; count: number }> {
  const totals = new Map<string, number>();
  for (const p of patterns) {
    const cat = p.category ?? "uncategorized";
    totals.set(cat, (totals.get(cat) ?? 0) + p.count);
  }
  return [...totals.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

export interface WeekStats {
  label: string; // e.g. "07-04..07-10"
  total: number;
  fixed: number;
  rate: number;
}

/** Last `weeks` 7-day buckets, oldest first. */
export function weeklyTrend(weeks: number): WeekStats[] {
  const out: WeekStats[] = [];
  const day = new Date();
  for (let w = 0; w < weeks; w++) {
    let total = 0;
    let fixed = 0;
    let end = "";
    let start = "";
    for (let i = 0; i < 7; i++) {
      const key = day.toISOString().slice(0, 10);
      if (i === 0) end = key.slice(5);
      start = key.slice(5);
      const records = readDay(key);
      total += records.length;
      fixed += records.filter((r) => r.mode === "correct" || r.mode === "translate").length;
      day.setDate(day.getDate() - 1);
    }
    out.push({
      label: `${start}..${end}`,
      total,
      fixed,
      rate: total > 0 ? Math.round((fixed / total) * 100) : 0,
    });
  }
  return out.reverse();
}

export function lastNDaysStats(n: number): PeriodStats {
  return periodStats(readLastNDays(n));
}
