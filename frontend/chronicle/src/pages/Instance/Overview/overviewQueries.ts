import { useQuery } from "@tanstack/react-query";
import type {
  SpeedrunCohortResponse,
  SpeedrunCohortRun,
  SpeedrunResult,
} from "@/api/typesGenerated";
import type { PopulationSelection } from "./populationSelectionState";

export interface ResolvedSpeedrunPopulation {
  label: string;
  selection: PopulationSelection;
  runs: readonly SpeedrunCohortRun[];
  windowStart?: string;
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
        const response = await fetch(
          `/api/v1/raidlogs/instances/${encodeURIComponent(selection.instanceId)}/speedrun`,
        );
        if (!response.ok) throw new Error("This raid does not have speedrun data");
        const speedrun = await response.json() as SpeedrunResult;
        return {
          label: `Raid ${selection.instanceId}`,
          selection,
          runs: [{
            instance_id: selection.instanceId,
            slug: selection.instanceId,
            start_time: speedrun.start_time,
            completion_time: speedrun.completion_time || undefined,
            duration_ms: speedrun.duration_ms > 0 ? speedrun.duration_ms : undefined,
            completed: speedrun.proof.length > 0 && speedrun.proof.every((proof) => proof.satisfied),
            qualified: speedrun.qualified,
            requirements_satisfied: speedrun.proof.filter((proof) => proof.satisfied).length,
            requirements_total: speedrun.proof.length,
          }],
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
        windowStart: cohort.cohort.window_start,
        windowEnd: cohort.cohort.window_end,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: selection !== undefined,
  });
}
