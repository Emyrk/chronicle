import type { SpeedrunCohortRun } from "@/api/typesGenerated";

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

/** Returns an inclusive 0-100 percentile where faster kill times score higher. */
export function killTimePercentile(durationMs: number, sortedValues: readonly number[]): number | null {
  if (sortedValues.length < 5) return null;
  const atLeastAsSlow = sortedValues.filter((value) => value >= durationMs).length;
  return Math.round((atLeastAsSlow / sortedValues.length) * 100);
}
