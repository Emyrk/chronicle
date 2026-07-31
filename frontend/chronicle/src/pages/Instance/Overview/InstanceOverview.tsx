import { useSearchParams } from "react-router-dom";
import type { Instance } from "../InstancePage";
import { RaidSummaryStrip } from "./RaidSummaryStrip";
import { EncounterKillTimesPanel } from "./EncounterKillTimesPanel";
import {
  parsePopulationSelection,
  serializePopulationSelection,
  type PopulationSelection,
} from "./populationSelectionState";

export function InstanceOverview({ instance }: { instance: Instance }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const comparison = parsePopulationSelection(searchParams.get("comparison"), instance.id);

  const primary = { kind: "instance", instanceId: instance.id } as const;
  const setComparison = (selection: PopulationSelection | undefined) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      const serialized = serializePopulationSelection(selection, instance.id);
      if (serialized) next.set("comparison", serialized);
      else next.delete("comparison");
      return next;
    }, { replace: true });
  };

  return (
    <section className="min-w-0 flex-1" aria-label="Instance overview">
      <RaidSummaryStrip
        primary={primary}
        comparison={comparison}
        guildAvailable={Boolean(instance.guild)}
        fixedAnchorInstanceId={instance.id}
        onComparisonChange={setComparison}
      />
      <EncounterKillTimesPanel primary={primary} comparison={comparison} />
    </section>
  );
}
