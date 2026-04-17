import { useCallback, useEffect, useMemo, useState } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import type { AbsorbedDamageResult } from "./absorbedDamage.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";
import type { InstanceUnit } from "@/api/typesGenerated";

/**
 * Aggregate absorbed damage data across selected encounters.
 */
function aggregateForEncounters(
  result: AbsorbedDamageResult,
  selectedTargets: Set<string>,
  selectedEncounterIds: string[],
  instanceUnits: Record<string, InstanceUnit>,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();

  for (const encounterId of selectedEncounterIds) {
    const encounterData = result.EncounterAbsorbed.get(encounterId);
    if (!encounterData) continue;

    for (const [playerId, data] of encounterData) {
      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += data.totalAbsorbed;
      } else {
        let dimmed = selectedTargets.size != 0 && !selectedTargets.has(playerId);
        if (dimmed && selectedTargets.has(instanceUnits[playerId]?.owner?.toString() || "")) {
          dimmed = false;
        }

        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: "",
          value: data.totalAbsorbed,
          dimmed: dimmed,
        });
      }
    }
  }

  return Array.from(aggregated.values());
}

type AbsorbedDamageContentProps = PanelRenderProps<AbsorbedDamageResult>;

export const AbsorbedDamageContent = (props: AbsorbedDamageContentProps) => {
  const { result, context, loading, processing } = props;

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.EncounterAbsorbed instanceof Map && r.EncounterAbsorbed.size > 0,
    [props.panelContextVersion],
  );

  const absorbedData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(
      cachedResult,
      context.entitySelection.playerIds,
      context.selectedEncounterIds,
      context.instance.units ?? {},
    );
  }, [cachedResult, context.entitySelection.playerIds, context.selectedEncounterIds, context.instance.units]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(absorbedData);
  }, [registerChartData, absorbedData]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Ctrl+click context menu (armory link only — no focus/breakout)
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; playerId: string; playerName: string;
  } | null>(null);

  const handleRowCtrlClick = useCallback((playerId: string, event: React.MouseEvent) => {
    const playerName = absorbedData.find(d => d.playerID === playerId)?.playerName ?? playerId;
    setContextMenu({ x: event.clientX, y: event.clientY, playerId, playerName });
  }, [absorbedData]);

  // Compute display total
  const total = absorbedData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = formatNumber(total, 0);

  return (
    <GenericPanel {...effectiveProps}>
      <div className="text-xs text-muted-foreground">
        Total Absorbed: <span className="font-medium font-mono text-foreground">{displayTotal}</span>
      </div>
      <PlayerMetricChart
        data={absorbedData}
        type={"healing"}
        panelTitle="Absorbed Damage"
        duration_millis={props.durationMs}
        perSecond={props.perSecond}
        onRowCtrlClick={handleRowCtrlClick}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
      {contextMenu && (() => {
        const armoryUrl = getArmoryUrl(props.context.instance, contextMenu.playerId);
        // Only show context menu if there's an armory link
        return armoryUrl ? (
          <RowContextMenu
            position={{ x: contextMenu.x, y: contextMenu.y }}
            playerName={contextMenu.playerName}
            onFocus={() => setContextMenu(null)}
            onClose={() => setContextMenu(null)}
            armoryUrl={armoryUrl}
            hideFocus
          />
        ) : null;
      })()}
    </GenericPanel>
  );
};
