import type { InstanceTimeParsesResponse, SpeedrunCohortRun } from "@/api/typesGenerated";

/** A snapshot-backed per-boss parse score ready for display. */
export interface SnapshotBossParse {
  displayScore: number;
  sampleSize: number;
  status: string;
}

/**
 * Maps snapshot API boss_kill_times[] to a lookup by encounter name.
 * Returns null when the snapshot is unavailable (loading, no_snapshot, disabled).
 * Individual entries with status "sample_too_small" get a null displayScore
 * so the badge renders "—" consistently with existing behavior.
 */
export function mapSnapshotBossParses(
  timeParses: InstanceTimeParsesResponse | undefined,
): ReadonlyMap<string, SnapshotBossParse | null> | null {
  if (!timeParses?.available) return null;
  const result = new Map<string, SnapshotBossParse | null>();
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
 * Resolves the display parse score for a single encounter row.
 * Returns a number when a valid snapshot score exists, or null when:
 * - snapshot is not available (snapshotParses is null)
 * - boss is missing from the snapshot
 * - sample is too small (entry is null)
 *
 * Never falls back to client-side cohort percentiles.
 */
export function resolveEncounterParseScore(
  snapshotParses: ReadonlyMap<string, SnapshotBossParse | null> | null,
  encounterName: string,
): number | null {
  if (!snapshotParses) return null;
  const entry = snapshotParses.get(encounterName);
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
