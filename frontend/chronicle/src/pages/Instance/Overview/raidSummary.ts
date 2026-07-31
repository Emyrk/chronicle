import type { SpeedrunCohortRun } from "@/api/typesGenerated";

export interface RaidSummaryValues {
  clearTimeMs: number | null;
  playerDeaths: number | null;
  wipeCount: number | null;
}

export function summarizePrimaryRaid(run: SpeedrunCohortRun | undefined): RaidSummaryValues {
  if (!run) return emptySummary();
  return {
    clearTimeMs: run.requirements_complete && run.duration_ms !== undefined && run.duration_ms > 0
      ? run.duration_ms
      : null,
    playerDeaths: run.overview?.player_deaths ?? null,
    wipeCount: run.overview?.wipe_count ?? null,
  };
}

export function summarizeComparisonRaids(runs: readonly SpeedrunCohortRun[]): RaidSummaryValues {
  const completeRuns = runs.filter((run) => run.requirements_complete);
  return {
    clearTimeMs: mean(completeRuns
      .filter((run) => run.duration_ms !== undefined && run.duration_ms > 0)
      .map((run) => run.duration_ms as number)),
    playerDeaths: mean(completeRuns
      .filter((run) => run.overview !== undefined)
      .map((run) => run.overview?.player_deaths as number)),
    wipeCount: mean(completeRuns
      .filter((run) => run.overview !== undefined)
      .map((run) => run.overview?.wipe_count as number)),
  };
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function emptySummary(): RaidSummaryValues {
  return { clearTimeMs: null, playerDeaths: null, wipeCount: null };
}
