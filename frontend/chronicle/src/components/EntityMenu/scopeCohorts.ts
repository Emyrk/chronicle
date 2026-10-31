import type { RankingsKillTimeStats, SpeedrunCohortRun } from "@/api/typesGenerated";
import { quantile } from "@/pages/ArmoryPage/overview/performanceExplorerModel";
import type { EncounterKillTimeSummary } from "@/pages/Instance/Overview/encounterKillTimePopulation";
import { useSpeedrunPopulation } from "@/pages/Instance/Overview/overviewQueries";
import type { Scope } from "./ScopeBoxPlots";

/** Matches the time parses, so a run's score and its place in the box describe the same runs. */
export const PULL_LOOKBACK_DAYS = 60;
/** A boss or raid without a run uses the server's time stats, which come in 7, 30 or 90 days. */
export const SERVER_STATS_LOOKBACK_DAYS = 90;

/** The log's server, realm and guild cohorts (same raid, size and difficulty), or none without a log. */
export function useScopeCohorts(logId: string | undefined) {
  const cohort = (scope: Scope) =>
    logId ? { kind: "cohort" as const, scope, anchorInstanceId: logId, lookbackDays: PULL_LOOKBACK_DAYS } : undefined;
  return {
    server: useSpeedrunPopulation(cohort("server")),
    realm: useSpeedrunPopulation(cohort("realm")),
    guild: useSpeedrunPopulation(cohort("guild")),
  };
}

/** Server time stats (seconds) as a box plot summary (milliseconds); `name` picks the encounter row. */
export function serverStatsSummary(
  stats: readonly RankingsKillTimeStats[] | undefined,
  name?: string,
): EncounterKillTimeSummary | undefined {
  const row = name === undefined ? stats?.[0] : stats?.find((item) => item.encounter_name === name);
  if (!row || row.count === 0) return undefined;
  const ms = (secs: number) => Math.round(secs * 1000);
  return { count: row.count, min: ms(row.min_secs), q1: ms(row.q1_secs), median: ms(row.median_secs), q3: ms(row.q3_secs), max: ms(row.max_secs), values: [] };
}

/** Full-clear times of a cohort's qualified runs as a box plot summary. */
export function summarizeClears(runs: readonly SpeedrunCohortRun[]): EncounterKillTimeSummary | undefined {
  const values = runs
    .filter((run) => run.qualified && (run.duration_ms ?? 0) > 0)
    .map((run) => run.duration_ms!)
    .sort((a, b) => a - b);
  if (values.length === 0) return undefined;
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
