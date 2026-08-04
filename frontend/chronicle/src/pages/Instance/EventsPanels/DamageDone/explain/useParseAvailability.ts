/**
 * Live capability extra: do parses exist for the current selection?
 *
 * Mirrors useParsePills' query (same endpoint, same encounter resolution) so
 * the "Understand parse scores" lesson lights up exactly when the panel's
 * pills would render.
 */

import { useMemo } from "react";
import { useInstanceParses } from "@/api/rankingsQueries";
import type { PanelContext } from "../../types";

export function useParseAvailability(context: PanelContext): boolean {
  const selectedBossEncounterNames = useMemo(() => {
    return context.instance.encounters
      .filter((e) => e.boss && e.kill_type !== "wipe" && e.kill_type !== "reset")
      .filter((e) => context.selectedEncounterIds.includes(e.id))
      .map((e) => e.name);
  }, [context.instance.encounters, context.selectedEncounterIds]);

  const { data } = useInstanceParses({
    instanceId: context.instance.id,
    encounterNames: selectedBossEncounterNames,
    metric: "dps",
    enabled: selectedBossEncounterNames.length > 0,
  });

  return !!data?.available && data.players.length > 0;
}
