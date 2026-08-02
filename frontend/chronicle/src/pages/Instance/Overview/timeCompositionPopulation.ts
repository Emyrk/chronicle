import type { SpeedrunCohortRun } from "@/api/typesGenerated";

export type TimeCompositionKey = "boss" | "trash" | "idle";

export interface TimeComposition {
  boss: number;
  trash: number;
  idle: number;
  total: number;
}

export interface TimeCompositionSummary {
  count: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  values: readonly number[];
}

export type TimeCompositionSummaries = Record<TimeCompositionKey, TimeCompositionSummary>;

function quantile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function timeComposition(run: SpeedrunCohortRun | undefined): TimeComposition | null {
  const overview = run?.overview;
  if (!overview) return null;

  const total = overview.encounter_span_duration_ms;
  const combat = overview.total_combat_duration_ms;
  const boss = overview.total_boss_duration_ms;
  if (total <= 0 || combat < 0 || boss < 0 || combat > total || boss > combat) return null;

  return {
    boss,
    trash: combat - boss,
    idle: total - combat,
    total,
  };
}

export function summarizeTimeCompositions(
  runs: readonly SpeedrunCohortRun[],
): TimeCompositionSummaries | null {
  const compositions = runs
    .filter((run) => run.requirements_complete)
    .map((run) => timeComposition(run))
    .filter((value): value is TimeComposition => value !== null);
  if (compositions.length === 0) return null;

  return {
    boss: summarize(compositions.map((value) => value.boss)),
    trash: summarize(compositions.map((value) => value.trash)),
    idle: summarize(compositions.map((value) => value.idle)),
  };
}

function summarize(values: number[]): TimeCompositionSummary {
  values.sort((a, b) => a - b);
  return {
    count: values.length,
    min: values[0],
    q1: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q3: quantile(values, 0.75),
    max: values[values.length - 1],
    values,
  };
}
