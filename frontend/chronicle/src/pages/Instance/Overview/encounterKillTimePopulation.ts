import type { CSSProperties } from "react";
import type { BossKillTimeParse, InstanceTimeParsesResponse, SpeedrunCohortRun } from "@/api/typesGenerated";
import { parseHexColor } from "../parseColors";

/** A server-computed per-boss parse score ready for display. */
export interface TimeBossParse {
  displayScore: number;
  sampleSize: number;
  status: string;
}

/**
 * Maps time-parse API boss_kill_times[] to a lookup by encounter name.
 * Returns null when time parses are unavailable (loading or disabled).
 * Individual entries with status "sample_too_small" get a null displayScore
 * so the badge renders "—" consistently with existing behavior.
 */
export function mapTimeBossParses(
  timeParses: InstanceTimeParsesResponse | undefined,
): ReadonlyMap<string, TimeBossParse | null> | null {
  if (!timeParses?.available) return null;
  const result = new Map<string, TimeBossParse | null>();
  for (const boss of timeParses.boss_kill_times) {
    if (boss.status === "sample_too_small") {
      result.set(boss.encounter_name, null);
    } else {
      result.set(boss.encounter_name, {
        displayScore: boss.display_score,
        sampleSize: boss.sample_size,
        status: boss.status,
      });
    }
  }
  return result;
}

/**
 * Indexes boss kill-time parses by encounter ID. Returns null when the
 * time parses are unavailable (loading or disabled) so callers can
 * fall back to the plain kill icon.
 */
export function bossKillParsesByEncounter(
  timeParses: InstanceTimeParsesResponse | undefined,
): ReadonlyMap<string, BossKillTimeParse> | null {
  if (!timeParses?.available) return null;
  return new Map(timeParses.boss_kill_times.map((boss) => [boss.encounter_id, boss]));
}

export function scoredKillParse(parse: BossKillTimeParse | undefined): BossKillTimeParse | undefined {
  return parse && parse.status !== "sample_too_small" ? parse : undefined;
}

/**
 * Left-edge accent colored by the server kill-time parse. Selected rows
 * already draw a left border, so recolor it; otherwise draw an inset bar
 * that does not shift row layout.
 */
export function killParseEdgeStyle(
  parse: BossKillTimeParse | undefined,
  isSelected: boolean,
): CSSProperties | undefined {
  const scored = scoredKillParse(parse);
  if (!scored) return undefined;
  const color = parseHexColor(scored.display_score);
  return isSelected ? { borderLeftColor: color } : { boxShadow: `inset 3px 0 0 ${color}` };
}

/**
 * Resolves the display parse score for a single encounter row.
 * Returns a number when a valid time-parse score exists, or null when:
 * - time parses are not available (timeParses is null)
 * - boss is missing from the response
 * - sample is too small (entry is null)
 *
 * Never falls back to client-side cohort percentiles.
 */
export function resolveEncounterParseScore(
  timeParses: ReadonlyMap<string, TimeBossParse | null> | null,
  encounterName: string,
): number | null {
  if (!timeParses) return null;
  const entry = timeParses.get(encounterName);
  if (entry === undefined || entry === null) return null;
  return entry.displayScore;
}

export interface EncounterKillTimeSummary {
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  values: readonly number[];
}

function quantile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function summarizeEncounterKillTimes(
  runs: readonly SpeedrunCohortRun[],
): ReadonlyMap<string, EncounterKillTimeSummary> {
  const valuesByEncounter = new Map<string, number[]>();

  for (const run of runs) {
    const fastestByEncounter = new Map<string, number>();
    for (const killTime of run.encounter_kill_times) {
      if (killTime.duration_ms <= 0) continue;
      const previous = fastestByEncounter.get(killTime.encounter_name);
      if (previous === undefined || killTime.duration_ms < previous) {
        fastestByEncounter.set(killTime.encounter_name, killTime.duration_ms);
      }
    }
    for (const [encounterName, durationMs] of fastestByEncounter) {
      const values = valuesByEncounter.get(encounterName) ?? [];
      values.push(durationMs);
      valuesByEncounter.set(encounterName, values);
    }
  }

  return new Map([...valuesByEncounter].map(([encounterName, values]) => {
    values.sort((a, b) => a - b);
    return [encounterName, {
      count: values.length,
      min: values[0],
      q1: quantile(values, 0.25),
      median: quantile(values, 0.5),
      q3: quantile(values, 0.75),
      max: values[values.length - 1],
      values,
    }];
  }));
}

export interface EncounterKillTimeComparisonRow {
  encounterName: string;
  primarySummary: EncounterKillTimeSummary | null;
  comparisonSummary: EncounterKillTimeSummary;
  percentile: number | null;
}

/** Builds rows from the comparison population so bosses missing from the primary raid remain visible. */
export function buildEncounterKillTimeComparisonRows(
  primarySummaries: ReadonlyMap<string, EncounterKillTimeSummary>,
  comparisonSummaries: ReadonlyMap<string, EncounterKillTimeSummary>,
): EncounterKillTimeComparisonRow[] {
  return [...comparisonSummaries].map(([encounterName, comparisonSummary]) => {
    const primarySummary = primarySummaries.get(encounterName) ?? null;
    return {
      encounterName,
      primarySummary,
      comparisonSummary,
      percentile: primarySummary
        ? killTimePercentile(primarySummary.median, comparisonSummary.values)
        : null,
    };
  });
}

/** Returns an inclusive 0-100 percentile where faster kill times score higher. */
export function killTimePercentile(durationMs: number, sortedValues: readonly number[]): number | null {
  if (sortedValues.length < 5) return null;
  const atLeastAsSlow = sortedValues.filter((value) => value >= durationMs).length;
  return Math.round((atLeastAsSlow / sortedValues.length) * 100);
}

export function averageKillTimePercentile(percentiles: readonly (number | null)[]): number | null {
  const available = percentiles.filter((percentile): percentile is number => percentile !== null);
  if (available.length === 0) return null;
  return Math.round(available.reduce((sum, percentile) => sum + percentile, 0) / available.length);
}
