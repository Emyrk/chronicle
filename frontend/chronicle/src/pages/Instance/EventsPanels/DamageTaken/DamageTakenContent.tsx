import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { DamageTakenResult, DamageTargetType } from "./damageTaken.processor";
import { extractGroupingFromPanelOption, extractPetModeFromPanelOption } from "../processors/resolveEntity";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useDamageTakenBreakout } from "./DamageTakenBreakout";
import { formatNumber } from "@/lib/format";

const FOCUS_PREFIX = "f:";

function parseFocusFromOption(option: string | null | undefined): string | null {
  if (!option) return null;
  const token = option.split(",").find(t => t.startsWith(FOCUS_PREFIX));
  return token ? token.slice(FOCUS_PREFIX.length) : null;
}

function updatePanelOptionToken(
  current: string | null | undefined,
  prefix: string,
  value: string | null,
): string | null {
  const tokens = current ? current.split(",").filter(t => !t.startsWith(prefix)) : [];
  if (value) tokens.push(`${prefix}${value}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

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

export function hasDamageTakenEncounterData(result: unknown): result is DamageTakenResult {
  return !!result &&
    typeof result === "object" &&
    "EncounterDamage" in result &&
    (result as { EncounterDamage?: unknown }).EncounterDamage instanceof Map &&
    (result as { EncounterDamage: Map<unknown, unknown> }).EncounterDamage.size > 0;
}

export const DamageTakenContent = (props: DamageTakenContentProps) => {
  const { targetType = "players" } = props;
  const { result, context } = props;

  // Ctrl+click context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; playerId: string; playerName: string;
  } | null>(null);

  const focusedPlayerId = useMemo(() => parseFocusFromOption(props.panelOption), [props.panelOption]);
  const setFocusedPlayerId = useCallback((id: string | null) => {
    if (!props.setPanelOption) return;
    props.setPanelOption(updatePanelOptionToken(props.panelOption, FOCUS_PREFIX, id));
  }, [props.setPanelOption, props.panelOption]);

  // Grouping is now driven by panelOption tokens (persisted in URL)
  const grouping = extractGroupingFromPanelOption(props.panelOption, "default");
  const petMode = extractPetModeFromPanelOption(props.panelOption, "individual");

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    hasDamageTakenEncounterData,
    [targetType, grouping, petMode, props.panelContextVersion]
  );

  const damageData = useMemo(() => {
    if (!cachedResult) return [];
    const disableUnitSelection = grouping === "name" || grouping === "class";
    return aggregateForEncounters(
      cachedResult,
      context.selectedEncounterIds,
      context.entitySelection,
      targetType,
      disableUnitSelection,
    );
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection, targetType, grouping]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(damageData);
  }, [registerChartData, damageData]);

  const handleRowCtrlClick = useCallback((playerId: string, event: React.MouseEvent) => {
    const playerName = damageData.find(d => d.playerID === playerId)?.playerName ?? playerId;
    setContextMenu({ x: event.clientX, y: event.clientY, playerId, playerName });
  }, [damageData]);

  // ESC key to unfocus
  useEffect(() => {
    if (!focusedPlayerId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedPlayerId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedPlayerId, setFocusedPlayerId]);

  // Build per-ability data for the focused player
  const focusedPlayer = focusedPlayerId
    ? damageData.find(d => d.playerID === focusedPlayerId)
    : null;

  const focusedAbilityData = useMemo(() => {
    if (!focusedPlayerId || !cachedResult) return null;
    const abilities = cachedResult.ByAbility.get(focusedPlayerId);
    if (!abilities) return null;

    const barClassName = focusedPlayer?.className ?? "foreground";
    const data: PlayerMetricChartData[] = [];
    for (const [abilityName, stats] of abilities) {
      data.push({
        playerID: abilityName,
        playerName: abilityName,
        className: barClassName,
        specialization: "",
        value: stats.Total,
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [focusedPlayerId, cachedResult, focusedPlayer?.className]);

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


      </div>
      {/* Focus header with back button */}
      {focusedPlayerId && focusedAbilityData && (
        <div className="flex items-center gap-1.5 mb-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            onClick={() => setFocusedPlayerId(null)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-medium">
            {focusedPlayer?.playerName}
          </span>
        </div>
      )}

      {focusedPlayerId && focusedAbilityData ? (
        <PlayerMetricChart
          data={focusedAbilityData}
          type="damage"
          panelTitle="Ability Breakdown"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      ) : (
        <PlayerMetricChart 
          data={damageData} 
          type={"damage"} 
          panelTitle={panelTitle}
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          breakout={breakout}
          onRowCtrlClick={handleRowCtrlClick}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      )}
      {contextMenu && (
        <RowContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          playerName={contextMenu.playerName}
          onFocus={() => { setFocusedPlayerId(contextMenu.playerId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
          armoryUrl={getArmoryUrl(props.context.instance, contextMenu.playerId)}
        />
      )}
    </GenericPanel>
  );
}
