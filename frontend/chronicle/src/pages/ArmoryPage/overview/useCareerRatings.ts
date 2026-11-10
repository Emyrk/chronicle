import { useMemo, useState } from "react";
import type { ArmoryPlayer } from "@/api/typesGenerated";
import { usePlayerCareer, usePlayerRatingHistory } from "@/api/career";
import { useSiteConfig, useSupportedInstanceProgressionBosses } from "@/api/queries";
import { buildRaidRatings, careerStatusText, cohortKey, defaultCohort } from "./careerRatingsModel";

/** Career ratings for the Armory performance overview, with the selected spec. */
export function useCareerRatings(player: ArmoryPlayer, enabled: boolean) {
  const { data: config } = useSiteConfig();
  const tenantID = config?.tenant?.id;
  const career = usePlayerCareer(tenantID, player.realm_name, player.id, enabled);
  const history = usePlayerRatingHistory(tenantID, player.realm_id, player.id, enabled);
  const { data: progressionBosses } = useSupportedInstanceProgressionBosses();
  const [selected, setSelected] = useState<string>();

  const cohorts = career.data?.cohorts;
  const cohort = cohorts?.find((c) => cohortKey(c) === selected) ?? defaultCohort(cohorts ?? []);
  const raids = useMemo(
    () => (cohort ? buildRaidRatings(cohort, history.data, progressionBosses) : []),
    [cohort, history.data, progressionBosses],
  );
  const error = career.error?.message;

  return {
    career: career.data,
    cohort,
    setCohort: setSelected,
    raids,
    metric: cohort?.summary.chosen_metric ?? "dps",
    isLoading: career.isPending || (history.isPending && !history.isError),
    error,
    emptyMessage:
      error
      ?? (cohort ? careerStatusText(cohort.summary.performance_status) : undefined)
      ?? (career.data ? careerStatusText(career.data.status) : undefined),
  };
}

export type CareerRatings = ReturnType<typeof useCareerRatings>;
