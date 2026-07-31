import { useSearchParams } from "react-router-dom";
import type { Instance } from "../InstancePage";
import { PopulationComparisonHeader } from "./PopulationComparisonHeader";
import { ClearTimePanel } from "./ClearTimePanel";
import { useSpeedrunPopulation } from "./overviewQueries";
import {
  parsePopulationSelection,
  serializePopulationSelection,
  type PopulationSelection,
} from "./populationSelectionState";

export function InstanceOverview({ instance }: { instance: Instance }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const comparison = parsePopulationSelection(searchParams.get("comparison"), instance.id);

  const primary = { kind: "instance", instanceId: instance.id } as const;
  const primaryQuery = useSpeedrunPopulation(primary);

  return (
    <section className="min-w-0 flex-1" aria-label="Instance overview">
      <PopulationComparisonHeader
        heading="Instance Overview"
        description="A summary of this instance run."
        comparison={comparison}
        comparisonEligible={primaryQuery.data !== undefined}
        eligibilityLoading={primaryQuery.isLoading}
        guildAvailable={Boolean(instance.guild)}
        fixedAnchorInstanceId={instance.id}
        onComparisonChange={(selection: PopulationSelection | undefined) => {
          setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            const serialized = serializePopulationSelection(selection, instance.id);
            if (serialized) next.set("comparison", serialized);
            else next.delete("comparison");
            return next;
          }, { replace: true });
        }}
      />

      <ClearTimePanel primary={primary} comparison={comparison} />
    </section>
  );
}
