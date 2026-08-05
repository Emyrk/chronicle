import { useQuery } from "@tanstack/react-query";
import type {
  InstanceOverviewMetrics,
  InstanceTimeParsesResponse,
  SpeedrunCohortOverviewMetrics,
  SpeedrunCohortResponse,
  SpeedrunCohortRun,
  SpeedrunResult,
} from "@/api/typesGenerated";
import type { PopulationSelection } from "./populationSelectionState";

export interface OverviewMetricsCoverage {
  eligibleRuns: number;
  runsWithMetrics: number;
  metricsVersion: number;
}

export interface ResolvedSpeedrunPopulation {
  label: string;
  selection: PopulationSelection;
  runs: readonly SpeedrunCohortRun[];
  overview: SpeedrunCohortOverviewMetrics;
  windowStart?: string;
  overviewCoverage?: OverviewMetricsCoverage;
  windowEnd?: string;
}

export function speedrunPopulationQueryKey(selection: PopulationSelection | undefined) {
  if (!selection) return ["rankings", "speedrun-population", "none"] as const;
  if (selection.kind === "instance") {
    return ["rankings", "speedrun-population", "instance", selection.instanceId] as const;
  }
  return [
    "rankings",
    "speedrun-cohort",
    selection.anchorInstanceId,
    selection.scope,
    selection.lookbackDays,
  ] as const;
}

export function useSpeedrunPopulation(selection: PopulationSelection | undefined) {
  return useQuery({
    queryKey: speedrunPopulationQueryKey(selection),
    queryFn: async (): Promise<ResolvedSpeedrunPopulation> => {
      if (!selection) throw new Error("No population selected");

      if (selection.kind === "instance") {
        const instanceURL = `/api/v1/raidlogs/instances/${encodeURIComponent(selection.instanceId)}`;
        const [speedrunResponse, overviewResponse] = await Promise.all([
          fetch(`${instanceURL}/speedrun`),
          fetch(`${instanceURL}/overview`),
        ]);
        if (!speedrunResponse.ok && !overviewResponse.ok) {
          throw new Error("This raid does not have Overview data");
        }
        const speedrun = speedrunResponse.ok
          ? await speedrunResponse.json() as SpeedrunResult
          : undefined;
        const overview = overviewResponse.ok
          ? await overviewResponse.json() as InstanceOverviewMetrics
          : undefined;
        const proof = speedrun?.proof ?? [];
        return {
          label: `Raid ${selection.instanceId}`,
          selection,
          runs: [{
            instance_id: selection.instanceId,
            slug: selection.instanceId,
            start_time: speedrun?.start_time ?? "",
            completion_time: speedrun?.completion_time || undefined,
            duration_ms: speedrun && speedrun.duration_ms > 0 ? speedrun.duration_ms : undefined,
            requirements_complete: overview?.requirements_complete
              ?? (proof.length > 0 && proof.every((requirement) => requirement.satisfied)),
            qualified: speedrun?.qualified ?? false,
            requirements_satisfied: proof.filter((requirement) => requirement.satisfied).length,
            requirements_total: proof.length,
            overview,
            encounter_kill_times: speedrun?.encounter_kill_times ?? [],
          }],
          overview: {
            runs: overview ? 1 : 0,
            top_incoming_damage_abilities: overview?.top_incoming_damage_abilities.map((ability) => ({
              ...ability,
              runs: 1,
            })) ?? [],
          },
        };
      }

      const searchParams = new URLSearchParams({
        scope: selection.scope,
        lookback_days: String(selection.lookbackDays),
      });
      const response = await fetch(
        `/api/v1/raidlogs/instances/${encodeURIComponent(selection.anchorInstanceId)}/speedrun/cohort?${searchParams}`,
      );
      if (!response.ok) throw new Error(`Unable to load ${selection.scope} cohort`);
      const cohort = await response.json() as SpeedrunCohortResponse;
      return {
        label: `${cohort.cohort.label} · ${cohort.cohort.lookback_days} days`,
        selection,
        runs: cohort.runs,
        overview: cohort.overview,
        windowStart: cohort.cohort.window_start,
        overviewCoverage: {
          eligibleRuns: cohort.cohort.eligible_runs,
          runsWithMetrics: cohort.cohort.runs_with_overview_metrics,
          metricsVersion: cohort.cohort.overview_metrics_version,
        },
        windowEnd: cohort.cohort.window_end,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: selection !== undefined,
  });
}

/**
 * Fetches immutable time-parse scores for an instance from the snapshot API.
 * Returns clear-time and per-boss kill-time scores computed server-side.
 */
export function useInstanceTimeParses(instanceId: string | undefined) {
  return useQuery({
    queryKey: ["rankings", "time-parses", instanceId] as const,
    queryFn: async (): Promise<InstanceTimeParsesResponse> => {
      if (!instanceId) throw new Error("No instance ID");
      const response = await fetch(
        `/api/v1/rankings/instances/${encodeURIComponent(instanceId)}/time-parses`,
      );
      if (!response.ok) throw new Error("Unable to load time parses");
      return response.json() as Promise<InstanceTimeParsesResponse>;
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: instanceId !== undefined,
  });
}
