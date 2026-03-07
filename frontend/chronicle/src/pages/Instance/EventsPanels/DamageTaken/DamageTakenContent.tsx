import { useEffect, useMemo } from "react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { DamageTakenResult, DamageTargetType, EnemyDamageTakenGrouping } from "./damageTaken.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDamageTakenBreakout } from "./DamageTakenBreakout";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
/**
 * Aggregate damage taken data across selected encounters.
 * Merges per-encounter data into a single map by unit.
 * 
 * - If selected.playerIds is non-empty (for players view), only include those players
 * - If selected.enemyIds is non-empty (for enemies view), only include those enemies
 */
function aggregateForEncounters(
  result: DamageTakenResult,
  selectedEncounterIds: string[],
  selected: EntitySelection,
  targetType: DamageTargetType,
  disableUnitSelection = false,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();

  const hasUnitSelection = !disableUnitSelection && (targetType === "players"
    ? selected.playerIds.size > 0
    : selected.enemyIds.size > 0);

  for (const encounterId of selectedEncounterIds) {
    const encounterDamage = result.EncounterDamage.get(encounterId);
    if (!encounterDamage) continue;

    for (const [unitId, data] of encounterDamage) {
      // Sum all damage from all sources (source filtering is handled by panel filters)
      let damageValue = 0;
      for (const amount of data.source.values()) {
        damageValue += amount;
      }

      if (damageValue === 0) continue;

      const existing = aggregated.get(unitId);
      if (existing) {
        existing.value += damageValue;
      } else {
        const unitSelection = targetType === "players" ? selected.playerIds : selected.enemyIds;
        aggregated.set(unitId, {
          playerID: data.unitID,
          playerName: data.unitName,
          className: data.className,
          specialization: data.specialization,
          value: damageValue,
          dimmed: hasUnitSelection && !unitSelection.has(unitId),
        });
      }
    }
  }

  return Array.from(aggregated.values());
}


interface DamageTakenContentProps extends PanelRenderProps<DamageTakenResult> {
  targetType?: DamageTargetType;
}

interface EnemyDamageTakenPanelContext {
  enemyGrouping?: EnemyDamageTakenGrouping;
}

export function hasDamageTakenEncounterData(result: unknown): result is DamageTakenResult {
  return !!result &&
    typeof result === "object" &&
    "EncounterDamage" in result &&
    (result as { EncounterDamage?: unknown }).EncounterDamage instanceof Map &&
    (result as { EncounterDamage: Map<unknown, unknown> }).EncounterDamage.size > 0;
}

export const DamageTakenContent = (props: DamageTakenContentProps) => {
  const { targetType = "players" } = props;
  const { result, context, panelContext, setPanelContext } = props;

  const enemyPanelContext = targetType === "enemies"
    ? (panelContext as EnemyDamageTakenPanelContext | null)
    : null;
  const enemyGrouping: EnemyDamageTakenGrouping = enemyPanelContext?.enemyGrouping ?? "guid";

  const setEnemyGrouping = (grouping: EnemyDamageTakenGrouping) => {
    if (!setPanelContext) return;

    if (grouping === "guid") {
      setPanelContext(null);
      return;
    }

    setPanelContext({ enemyGrouping: grouping });
  };

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    hasDamageTakenEncounterData,
    [targetType, enemyGrouping, props.panelContextVersion]
  );

  const damageData = useMemo(() => {
    if (!cachedResult) return [];
    const disableUnitSelection = targetType === "enemies" && enemyGrouping === "name";
    return aggregateForEncounters(
      cachedResult,
      context.selectedEncounterIds,
      context.entitySelection,
      targetType,
      disableUnitSelection,
    );
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection, targetType, enemyGrouping]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(damageData);
  }, [registerChartData, damageData]);

  // Create breakout function for tooltips
  const breakout = useDamageTakenBreakout({
    result: result,
    context: context,
    valueLabel: "Damage",
    perSecond: props.perSecond,
    durationMs: props.durationMs,
    loading: props.loading,
    processing: props.processing,
  });

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  const panelTitle = targetType === "players" ? "Damage Taken" : "Enemy Damage Taken";
  // Compute display total
  const total = damageData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = props.perSecond && props.durationMs
    ? formatNumber(total / (props.durationMs / 1000), 1)
    : formatNumber(total, 0);

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{displayTotal}{props.perSecond ? '/s' : ''}</span>
        </div>

        {targetType === "enemies" && (
          <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5">
            <button
              type="button"
              onClick={() => setEnemyGrouping("guid")}
              className={cn(
                "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                enemyGrouping === "guid"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              By Unit
            </button>
            <button
              type="button"
              onClick={() => setEnemyGrouping("name")}
              className={cn(
                "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                enemyGrouping === "name"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              By Name
            </button>
          </div>
        )}
      </div>
      <PlayerMetricChart 
        data={damageData} 
        type={"damage"} 
        panelTitle={panelTitle}
        duration_millis={props.durationMs}
        perSecond={props.perSecond}
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
}
