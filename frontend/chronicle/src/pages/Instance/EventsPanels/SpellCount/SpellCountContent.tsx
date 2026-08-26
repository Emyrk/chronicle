import { useEffect, useMemo } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { formatNumber } from "@/lib/format";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { SpellCountResult } from "./spellCount.processor";

function aggregateForEncounters(
  result: SpellCountResult,
  selectedEncounterIds: string[],
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();

  for (const encounterID of selectedEncounterIds) {
    const encounterCounts = result.EncounterSpellCounts.get(encounterID);
    if (!encounterCounts) continue;

    for (const data of encounterCounts.values()) {
      const existing = aggregated.get(data.playerID);
      if (existing) {
        existing.value += data.successful;
        existing.stackedValue = (existing.stackedValue ?? 0) + data.failed;
        continue;
      }

      aggregated.set(data.playerID, {
        playerID: data.playerID,
        playerName: data.playerName,
        className: data.className,
        specialization: "",
        value: data.successful,
        stackedValue: data.failed > 0 ? data.failed : undefined,
      });
    }
  }

  return Array.from(aggregated.values());
}

export function SpellCountContent(props: PanelRenderProps<SpellCountResult>) {
  const { context, registerChartData, result } = props;
  const chartData = useMemo(
    () => aggregateForEncounters(result, context.selectedEncounterIds),
    [context.selectedEncounterIds, result],
  );

  useEffect(() => {
    registerChartData?.(chartData);
  }, [chartData, registerChartData]);

  const successful = chartData.reduce((sum, row) => sum + row.value, 0);
  const failed = chartData.reduce((sum, row) => sum + (row.stackedValue ?? 0), 0);

  return (
    <GenericPanel {...props}>
      <div className="flex gap-3 text-xs text-muted-foreground">
        <span>
          Casts: <span className="font-mono font-medium text-foreground">{formatNumber(successful, 0)}</span>
        </span>
        <span>
          Failed: <span className="font-mono font-medium text-foreground">{formatNumber(failed, 0)}</span>
        </span>
      </div>
      <PlayerMetricChart
        data={chartData}
        type="healing"
        panelTitle="Spell Casts"
        stackedLabel="Failed"
        disableInteractions={context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
}
