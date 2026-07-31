import type { SpeedrunCohortRun } from "@/api/typesGenerated";

export interface ClearTimeSummary {
  count: number;
  best: number;
  mean: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

function quantile(sorted: readonly number[], fraction: number): number {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

export function summarizeClearTimes(runs: readonly SpeedrunCohortRun[]): ClearTimeSummary | null {
  const values = runs
    .filter((run) => run.qualified && run.duration_ms !== undefined && run.duration_ms > 0)
    .map((run) => run.duration_ms as number)
    .sort((a, b) => a - b);

  if (values.length === 0) return null;
  return {
    count: values.length,
    best: values[0],
    mean: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: values[0],
    q1: quantile(values, 0.25),
    median: quantile(values, 0.5),
    q3: quantile(values, 0.75),
    max: values[values.length - 1],
  };
}
