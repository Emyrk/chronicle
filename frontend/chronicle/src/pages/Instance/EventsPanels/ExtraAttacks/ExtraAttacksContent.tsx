import { useMemo } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { ExtraAttacksResult } from "./extraAttacks.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";
import { useExtraAttacksBreakout } from "./ExtraAttacksBreakout";
import type { InstanceUnit } from "@/api/typesGenerated";

/**
 * Aggregate extra attacks data across selected encounters.
 */
function aggregateForEncounters(
  result: ExtraAttacksResult,
  selectedTargets: Set<string>,
  selectedEncounterIds: string[],
  instanceUnits: Record<string, InstanceUnit>,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();
  
  for (const encounterId of selectedEncounterIds) {
    const encounterData = result.EncounterExtraAttacks.get(encounterId);
    if (!encounterData) continue;
    
    for (const [playerId, data] of encounterData) {
      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += data.totalProcs;
      } else {
        let dimmed = selectedTargets.size != 0 && !selectedTargets.has(playerId)
        if(dimmed && selectedTargets.has(instanceUnits[playerId]?.owner?.toString() || "")){
          dimmed = false;
        }

        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: "",
          value: data.totalProcs,
          dimmed: dimmed,
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}


type ExtraAttacksContentProps = PanelRenderProps<ExtraAttacksResult>;

export const ExtraAttacksContent = (props: ExtraAttacksContentProps) => {
  const { result, context, loading, processing } = props;
  
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => r.EncounterExtraAttacks.size > 0,
    []
  );

  const extraAttacksData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(cachedResult, context.entitySelection.playerIds, context.selectedEncounterIds, context.instance.units ?? {});
  }, [cachedResult, context.entitySelection.playerIds, context.selectedEncounterIds]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Create breakout function for showing ability sources
  const breakout = useExtraAttacksBreakout({
    result: cachedResult,
    context,
    loading: hasData ? false : loading,
    processing: hasData ? false : processing,
  });

  // Compute display total
  const total = extraAttacksData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = formatNumber(total, 0);

  return (
    <GenericPanel {...effectiveProps}>
      <div className="text-xs text-muted-foreground">
        Total Procs: <span className="font-medium font-mono text-foreground">{displayTotal}</span>
      </div>
      <PlayerMetricChart 
        data={extraAttacksData} 
        type={"healing"} // Use healing color (green) to distinguish from damage
        panelTitle="Extra Attacks"
        duration_millis={props.durationMs}
        perSecond={props.perSecond}
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
}
