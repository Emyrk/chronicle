import type { CharacterEncounterStats, CharacterPerformanceRun } from "@/api/typesGenerated";

export interface PerformanceInstanceVariant {
  key: string;
  instanceName: string;
  difficultyName: string;
  maxPlayers: number;
  encounters: string[];
  lastKilledAt: string;
}

export function buildPerformanceVariants(
  encounters: readonly CharacterEncounterStats[],
): PerformanceInstanceVariant[] {
  const variants = new Map<string, PerformanceInstanceVariant>();

  for (const encounter of encounters) {
    if (encounter.encounter_name === "Trash") continue;
    const key = [encounter.instance_name, encounter.difficulty_name, encounter.max_players].join("\u0000");
    const existing = variants.get(key);
    if (existing) {
      if (!existing.encounters.includes(encounter.encounter_name)) {
        existing.encounters.push(encounter.encounter_name);
      }
      if (encounter.last_killed_at > existing.lastKilledAt) {
        existing.lastKilledAt = encounter.last_killed_at;
      }
      continue;
    }

    variants.set(key, {
      key,
      instanceName: encounter.instance_name,
      difficultyName: encounter.difficulty_name,
      maxPlayers: encounter.max_players,
      encounters: [encounter.encounter_name],
      lastKilledAt: encounter.last_killed_at,
    });
  }

  return [...variants.values()]
    .map((variant) => ({ ...variant, encounters: [...variant.encounters].sort() }))
    .sort((a, b) => b.lastKilledAt.localeCompare(a.lastKilledAt));
}

export function filterPerformanceRuns(
  runs: readonly CharacterPerformanceRun[],
  spec: string | null,
  subSpec: string | null,
  display: "raw" | "parse",
): CharacterPerformanceRun[] {
  return runs.filter((run) => {
    if (display === "parse" && run.average_parse == null) return false;
    if (spec && run.player_spec !== spec) return false;
    if (subSpec && run.player_sub_spec !== subSpec) return false;
    return true;
  });
}

export type PerformanceDateRange = "180d" | "60d" | "30d";

export function filterPerformanceRunsByDate(
  runs: readonly CharacterPerformanceRun[],
  range: PerformanceDateRange,
  now = new Date(),
): CharacterPerformanceRun[] {
  const days = range === "180d" ? 180 : range === "60d" ? 60 : 30;
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return runs.filter((run) => new Date(run.started_at).getTime() >= cutoff);
}

export interface PerformanceRunFilter {
  id: string;
  runs: readonly CharacterPerformanceRun[];
  spec: string | null;
  subSpec: string | null;
}

export interface FilteredPerformanceRunSeries {
  id: string;
  rawRuns: CharacterPerformanceRun[];
  runs: CharacterPerformanceRun[];
}

export function filterPerformanceRunSeries(
  filters: readonly PerformanceRunFilter[],
  display: "raw" | "parse",
  range: PerformanceDateRange,
  now = new Date(),
): FilteredPerformanceRunSeries[] {
  return filters.map((filter) => ({
    id: filter.id,
    rawRuns: filterPerformanceRunsByDate(
      filterPerformanceRuns(filter.runs, filter.spec, filter.subSpec, "raw"),
      range,
      now,
    ),
    runs: filterPerformanceRunsByDate(
      filterPerformanceRuns(filter.runs, filter.spec, filter.subSpec, display),
      range,
      now,
    ),
  }));
}

export interface PerformanceWaterlines {
  average: number;
  bestThreeAverage: number;
}

export function calculatePerformanceWaterlines(values: readonly number[]): PerformanceWaterlines | null {
  if (values.length === 0) return null;

  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const bestThree = [...values].sort((a, b) => b - a).slice(0, 3);
  const bestThreeAverage = bestThree.reduce((sum, value) => sum + value, 0) / bestThree.length;
  return { average, bestThreeAverage };
}

export function performanceValue(
  run: CharacterPerformanceRun,
  metric: "dps" | "hps",
  display: "raw" | "parse",
): number {
  if (display === "parse") return run.average_parse ?? 0;
  return metric === "hps" ? run.hps : run.dps;
}
