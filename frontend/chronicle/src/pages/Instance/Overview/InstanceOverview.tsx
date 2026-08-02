import { FlaskConical } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Instance } from "../InstancePage";
import { RaidSummaryStrip } from "./RaidSummaryStrip";
import { EncounterKillTimesPanel } from "./EncounterKillTimesPanel";
import { TimeCompositionPanel } from "./TimeCompositionPanel";
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
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-amber-100">
        <FlaskConical className="size-4 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 text-xs">
          <span className="font-semibold text-amber-300">Overview Beta</span>
          <span className="ml-2 text-muted-foreground">
            This page is actively being developed. Metrics and presentation may change.
          </span>
        </div>
      </div>
      <RaidSummaryStrip
        primary={primary}
        comparison={comparison}
        guildAvailable={Boolean(instance.guild)}
        fixedAnchorInstanceId={instance.id}
        onComparisonChange={setComparison}
      />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <EncounterKillTimesPanel primary={primary} comparison={comparison} />
        <TimeCompositionPanel primary={primary} comparison={comparison} />
      </div>
    </section>
  );
}
