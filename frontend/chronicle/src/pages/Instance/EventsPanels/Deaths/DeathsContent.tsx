import { useEffect, useMemo } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { DeathsResult, UnitDeaths } from "./deaths.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDeathsBreakout } from "./DeathsBreakout";

/**
 * Aggregate death counts across selected encounters.
 */
function aggregateForEncounters(
  deathsMap: Map<string, UnitDeaths>,
  selectedEncounterIds: string[]
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();

  for (const encounterId of selectedEncounterIds) {
    const encounterData = deathsMap.get(encounterId);
    if (!encounterData) continue;

    for (const [unitId, data] of encounterData) {
      const existing = aggregated.get(unitId);
      if (existing) {
        existing.value += data.deathCount;
      } else {
        aggregated.set(unitId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: "",
          value: data.deathCount,
          dimmed: false,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

type DeathsContentProps = PanelRenderProps<DeathsResult>;

export const DeathsContent = (props: DeathsContentProps) => {
  const { result, context, loading, processing } = props;

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.EncounterDeaths instanceof Map && r.EncounterDeaths.size > 0,
    [props.panelContextVersion]
  );

  const deathsData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(cachedResult.EncounterDeaths, context.selectedEncounterIds);
  }, [cachedResult, context.selectedEncounterIds]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(deathsData);
  }, [registerChartData, deathsData]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Create breakout function for showing killer sources
  const breakout = useDeathsBreakout({
    result: cachedResult,
    context,
    loading: hasData ? false : loading,
    processing: hasData ? false : processing,
  });

  // Compute display total
  const total = deathsData.reduce((sum, d) => sum + d.value, 0);

  return (
    <GenericPanel {...effectiveProps}>
      <div className="text-xs text-muted-foreground">
        Total Deaths: <span className="font-medium text-foreground">{total}</span>
      </div>
      <PlayerMetricChart
        data={deathsData}
        type={"damage"} // Use red color scheme for deaths
        panelTitle="Deaths"
        duration_millis={props.durationMs}
        perSecond={false} // Deaths per second doesn't make sense
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
};
