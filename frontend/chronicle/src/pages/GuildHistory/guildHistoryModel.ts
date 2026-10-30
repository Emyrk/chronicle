import { fitTrend, quantile, type PerformanceTrendLine } from "@/pages/ArmoryPage/overview/performanceExplorerModel";
import type { GuildSpeedrunRun } from "@/api/typesGenerated";
import type { GuildHistoryDisplay, GuildHistoryTiming } from "./guildHistoryState";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixed categorical order so a guild keeps its color when others are added or removed. */
export const GUILD_SERIES_COLORS = ["#38bdf8", "#f59e0b", "#a78bfa", "#34d399", "#fb7185"];

export const GUILD_RECENT_RUN_COUNT = 5;

/** Longer values are usually logs left running and would flatten the useful clear-time chart. */
export const GUILD_HISTORY_MAX_TIME_HOURS = 6;
export const GUILD_HISTORY_MAX_TIME_MS = GUILD_HISTORY_MAX_TIME_HOURS * 60 * 60 * 1000;

/** A clear must sit at least this fraction of the typical clear beyond the middle half to be an outlier. */
const MIN_OUTLIER_GAP = 0.1;
/** The same minimum gap for parses, in parse points. */
const MIN_OUTLIER_PARSE_GAP = 10;

export type ClearPart = "boss" | "trash" | "idle";

export const CLEAR_PART_LABELS: Record<ClearPart, string> = {
  boss: "Boss fight time",
  trash: "Trash time",
  idle: "Idle time",
};

/** What the chart and summary measure: whole clears, one part of each clear, or one boss's kills. */
export interface GuildFocus {
  boss: string;
  part: ClearPart | "";
}

export const NO_FOCUS: GuildFocus = { boss: "", part: "" };

export function focusLabel(focus: GuildFocus): string {
  if (focus.boss) return focus.boss;
  if (focus.part) return CLEAR_PART_LABELS[focus.part];
  return "Whole clear";
}

/**
 * The time charted for a run: its clear time, one part of it, or a focused boss's fight length.
 * Zero when the run has no such time, such as a focused boss it never killed.
 */
export function guildRunDuration(run: GuildSpeedrunRun, timing: GuildHistoryTiming, focus: GuildFocus = NO_FOCUS): number {
  if (focus.boss) return run.bosses.find((kill) => kill.encounter_name === focus.boss)?.duration_ms ?? 0;
  if (focus.part) {
    if (run.bosses.length === 0) return 0;
    const parts = clearTimeParts(run);
    return focus.part === "boss" ? parts.bossMs : focus.part === "trash" ? parts.trashMs : parts.idleMs;
  }
  return timing === "boss" ? run.boss_to_boss_duration_ms : run.duration_ms;
}

/**
 * The value charted for a run: a time (lower is better) or a time parse (higher is better).
 * Null when the run has none, such as a boss it never killed or a clear without a stored parse.
 * Parses exist for whole clears and boss kills, not for boss-to-boss timing or clear parts.
 */
export function guildRunValue(
  run: GuildSpeedrunRun,
  timing: GuildHistoryTiming,
  focus: GuildFocus,
  display: GuildHistoryDisplay,
): number | null {
  if (display === "parse") {
    if (focus.boss) return run.bosses.find((kill) => kill.encounter_name === focus.boss)?.parse ?? null;
    if (focus.part || timing === "boss") return null;
    return run.clear_parse;
  }
  const duration = guildRunDuration(run, timing, focus);
  return duration > 0 ? duration : null;
}

/** Whether a value belongs in history statistics and charts. Parse values are never time-limited. */
export function guildHistoryValueIsShown(value: number, display: GuildHistoryDisplay): boolean {
  return display === "parse" || value <= GUILD_HISTORY_MAX_TIME_MS;
}

/** Whether parses exist for what is being measured. */
export function parsesAvailable(timing: GuildHistoryTiming, focus: GuildFocus): boolean {
  return !focus.part && (!!focus.boss || timing === "full");
}

/** A time as h:mm:ss or m:ss, or a parse with one decimal. */
export function formatGuildValue(value: number, parse: boolean): string {
  return parse ? value.toFixed(1) : formatClearTime(value);
}

export function filterGuildRuns(
  runs: readonly GuildSpeedrunRun[],
  { includeUnqualified, rangeDays, now = Date.now() }: { includeUnqualified: boolean; rangeDays: number; now?: number },
): GuildSpeedrunRun[] {
  const cutoff = now - rangeDays * DAY_MS;
  return runs.filter((run) => (
    (includeUnqualified || run.qualified)
    && run.duration_ms > 0
    && Date.parse(run.completion_time) >= cutoff
  ));
}

/**
 * Clear stats. For times lower is better, so Best is the fastest clear and Worst the 90th
 * percentile; for parses higher is better, so Best is the highest and Worst the 10th percentile.
 */
export interface ClearSummary {
  /** Values are parses (higher is better) rather than times (lower is better). */
  parse: boolean;
  runCount: number;
  best: number;
  typical: number;
  /** Median of the latest clears; null until there are more clears than the recent window. */
  recent: number | null;
  worst: number;
  spread: number;
  lowerQuartile: number;
  upperQuartile: number;
  lowWhisker: number;
  highWhisker: number;
  /** Clears beyond 1.5x spread from the middle half, and at least 10% of Typical from it. Ascending. */
  outliers: number[];
  /** Theil–Sen trend in value per day; null below 3 clears. */
  trend: PerformanceTrendLine | null;
  /** The spread once there are enough clears to judge it; null below 3 clears. */
  consistency: number | null;
}

export function summarizeClearTimes(
  runs: readonly GuildSpeedrunRun[],
  timing: GuildHistoryTiming,
  focus: GuildFocus = NO_FOCUS,
  display: GuildHistoryDisplay = "time",
): ClearSummary | null {
  const timed = runs.flatMap((run) => {
    // Unqualified runs can be displayed for context, but must not define Best,
    // Typical, Trend, or other headline performance statistics.
    if (!run.qualified) return [];
    const value = guildRunValue(run, timing, focus, display);
    return value === null || !guildHistoryValueIsShown(value, display) ? [] : [{ run, value }];
  });
  if (timed.length === 0) return null;

  const parse = display === "parse";
  const values = timed.map(({ value }) => value).sort((a, b) => a - b);
  const recentValues = [...timed]
    .sort((a, b) => b.run.completion_time.localeCompare(a.run.completion_time))
    .slice(0, GUILD_RECENT_RUN_COUNT)
    .map(({ value }) => value)
    .sort((a, b) => a - b);
  const box = boxStats(values, parse ? MIN_OUTLIER_PARSE_GAP : undefined);

  return {
    parse,
    runCount: timed.length,
    best: parse ? values[values.length - 1] : values[0],
    typical: box.median,
    recent: timed.length > GUILD_RECENT_RUN_COUNT ? quantile(recentValues, 0.5) : null,
    worst: quantile(values, parse ? 0.1 : 0.9),
    spread: box.upperQuartile - box.lowerQuartile,
    lowerQuartile: box.lowerQuartile,
    upperQuartile: box.upperQuartile,
    lowWhisker: box.lowWhisker,
    highWhisker: box.highWhisker,
    outliers: box.outliers,
    trend: timed.length >= 3
      ? fitTrend(timed.map(({ run, value }) => ({ day: Date.parse(run.completion_time) / DAY_MS, value })))
      : null,
    consistency: timed.length >= 3 ? box.upperQuartile - box.lowerQuartile : null,
  };
}

export interface BoxStats {
  median: number;
  lowerQuartile: number;
  upperQuartile: number;
  /** Lowest and highest values that are not outliers. */
  lowWhisker: number;
  highWhisker: number;
  /** Values beyond 1.5x the middle half's width from it, and at least a minimum gap from it. Ascending. */
  outliers: number[];
}

/**
 * Box-plot numbers for an ascending, non-empty list of values. An outlier must also sit at least
 * minGap beyond the middle half; it defaults to 10% of the median, which suits times.
 */
export function boxStats(sorted: readonly number[], minGap?: number): BoxStats {
  const median = quantile(sorted, 0.5);
  const lowerQuartile = quantile(sorted, 0.25);
  const upperQuartile = quantile(sorted, 0.75);
  const fenceGap = Math.max((upperQuartile - lowerQuartile) * 1.5, minGap ?? median * MIN_OUTLIER_GAP);
  const lowFence = lowerQuartile - fenceGap;
  const highFence = upperQuartile + fenceGap;
  const inside = sorted.filter((value) => value >= lowFence && value <= highFence);
  return {
    median,
    lowerQuartile,
    upperQuartile,
    lowWhisker: inside[0],
    highWhisker: inside[inside.length - 1],
    outliers: sorted.filter((value) => value < lowFence || value > highFence),
  };
}

/**
 * Consistency from the spread: for times, as a percent of the typical clear, with cutoffs wider
 * than for players because raids swing more than single fights; for parses, in parse points.
 */
export function clearConsistencyLabel(spread: number, typical: number, parse = false): "High" | "Med" | "Low" {
  if (parse) return spread <= 4 ? "High" : spread <= 8 ? "Med" : "Low";
  const scaled = (spread / Math.max(typical, 1)) * 100;
  if (scaled <= 10) return "High";
  if (scaled <= 20) return "Med";
  return "Low";
}

export interface BossSplit extends BoxStats {
  name: string;
  /** Median position in the kill order, used to line bosses up across guilds. */
  order: number;
  kills: number;
  /** Median fight length. */
  typicalMs: number;
  /** Fastest fight. */
  bestMs: number;
  /** Median time from the start of the clear to the kill. */
  typicalSplitMs: number;
  /** Every kill's fight length, ascending. */
  durations: number[];
}

export interface BossSplitSummary {
  bosses: BossSplit[];
  /** Medians of each clear's boss, trash and idle time. They need not add up to the typical clear. */
  typicalBossMs: number;
  typicalTrashMs: number;
  typicalIdleMs: number;
  typicalClearMs: number;
}

export interface ClearTimeParts {
  /** Time in boss fights. */
  bossMs: number;
  /** Time fighting trash outside boss fights. */
  trashMs: number;
  /** Everything else: walking, buffing, waiting and wipe recovery. */
  idleMs: number;
}

export function clearTimeParts(run: GuildSpeedrunRun): ClearTimeParts {
  const bossMs = run.bosses.reduce((sum, boss) => sum + boss.duration_ms, 0);
  const trashMs = Math.min(run.trash_duration_ms, Math.max(0, run.duration_ms - bossMs));
  return { bossMs, trashMs, idleMs: Math.max(0, run.duration_ms - bossMs - trashMs) };
}

export function summarizeBossSplits(runs: readonly GuildSpeedrunRun[]): BossSplitSummary | null {
  const complete = runs.filter((run) => run.bosses.length > 0 && run.duration_ms > 0);
  if (complete.length === 0) return null;

  const byBoss = new Map<string, { durations: number[]; splits: number[]; positions: number[] }>();
  for (const run of complete) {
    const start = Date.parse(run.start_time);
    const ordered = [...run.bosses].sort((a, b) => a.killed_at.localeCompare(b.killed_at));
    ordered.forEach((boss, index) => {
      const entry = byBoss.get(boss.encounter_name) ?? { durations: [], splits: [], positions: [] };
      entry.durations.push(boss.duration_ms);
      entry.splits.push(Date.parse(boss.killed_at) - start);
      entry.positions.push(index);
      byBoss.set(boss.encounter_name, entry);
    });
  }

  const parts = complete.map(clearTimeParts);
  return {
    bosses: [...byBoss.entries()]
      .map(([name, entry]) => {
        const durations = [...entry.durations].sort((a, b) => a - b);
        return {
          ...boxStats(durations),
          name,
          order: median(entry.positions),
          kills: durations.length,
          typicalMs: median(durations),
          bestMs: durations[0],
          typicalSplitMs: median(entry.splits),
          durations,
        };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
    typicalBossMs: median(parts.map((part) => part.bossMs)),
    typicalTrashMs: median(parts.map((part) => part.trashMs)),
    typicalIdleMs: median(parts.map((part) => part.idleMs)),
    typicalClearMs: median(complete.map((run) => run.duration_ms)),
  };
}

/** One boss order for several guilds: by average kill position, so guilds that route differently still share rows. */
export function mergeBossOrder(summaries: readonly (BossSplitSummary | null)[]): string[] {
  const positions = new Map<string, number[]>();
  for (const summary of summaries) {
    for (const boss of summary?.bosses ?? []) {
      positions.set(boss.name, [...(positions.get(boss.name) ?? []), boss.order]);
    }
  }
  return [...positions.entries()]
    .map(([name, orders]) => ({ name, order: orders.reduce((sum, value) => sum + value, 0) / orders.length }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((boss) => boss.name);
}

/** h:mm:ss above an hour, m:ss below. */
export function formatClearTime(ms: number): string {
  const totalSeconds = Math.round(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const sign = ms < 0 ? "−" : "";
  if (hours > 0) return `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
}

function median(values: readonly number[]): number {
  return quantile([...values].sort((a, b) => a - b), 0.5);
}
