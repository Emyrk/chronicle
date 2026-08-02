import { FlaskConical, SlidersHorizontal } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import type { Instance } from "../InstancePage";
import { RaidSummaryStrip } from "./RaidSummaryStrip";
import { EncounterKillTimesPanel } from "./EncounterKillTimesPanel";
import { TimeCompositionPanel } from "./TimeCompositionPanel";
import { PopulationSelector } from "./PopulationSelector";
import { useSpeedrunPopulation } from "./overviewQueries";
import {
  formatPopulationSelection,
  parsePopulationSelection,
  serializePopulationSelection,
  type PopulationSelection,
} from "./populationSelectionState";

export function InstanceOverview({ instance }: { instance: Instance }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const comparison = parsePopulationSelection(searchParams.get("comparison"), instance.id);
  const comparisonQuery = useSpeedrunPopulation(comparison);

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
      <div className="mb-4 flex min-h-14 flex-wrap items-center justify-between gap-3 rounded-lg border border-border/80 bg-card/75 px-4 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Comparing against
          </span>
          <span className="truncate text-sm font-semibold text-foreground">
            {comparisonQuery.data?.label
              ?? (comparison ? formatPopulationSelection(comparison) : "No comparison")}
          </span>
          {comparisonQuery.data && (
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {comparisonQuery.data.runs.length.toLocaleString()} {comparisonQuery.data.runs.length === 1 ? "raid" : "raids"}
            </span>
          )}
        </div>
        <PopulationSelector
          label="Compare against"
          value={comparison}
          allowNone
          compact
          disabled={comparisonQuery.isLoading}
          guildAvailable={Boolean(instance.guild)}
          fixedAnchorInstanceId={instance.id}
          onChange={setComparison}
        />
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.06] px-4 py-2.5 text-amber-100">
        <FlaskConical className="size-4 shrink-0 text-amber-400" aria-hidden />
        <div className="min-w-0 text-xs">
          <span className="font-semibold text-amber-300">Overview Beta</span>
          <span className="ml-2 text-muted-foreground">
            This page is actively being developed. Metrics and presentation may change.
          </span>
        </div>
      </div>
      <RaidSummaryStrip primary={primary} comparison={comparison} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <EncounterKillTimesPanel primary={primary} comparison={comparison} />
        <TimeCompositionPanel primary={primary} comparison={comparison} />
      </div>
    </section>
  );
}
