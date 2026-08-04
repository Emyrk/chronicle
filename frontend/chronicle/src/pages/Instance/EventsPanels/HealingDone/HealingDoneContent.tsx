import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, Layers } from "lucide-react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { useParsePills } from "../parsePills";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { AbilityBreakout, type AbilityData } from "@/components/ui/AbilityBreakout";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { UnifiedHealingResult } from "../processors";
import type { HealingSourceType } from "./HealingDone";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useHealingDoneBreakout } from "./HealingDoneBreakout";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/Tooltip/tooltip";
import { useSyncModeContextOptional } from "../../SyncModeContext";

/**
 * View modes for healing display
 */
export type HealingViewMode = "effective" | "overheal" | "total";

/**
 * Aggregate healing data across selected encounters.
 * Merges per-encounter data into a single map by player.
 * 
 * @param viewMode - Controls what values are shown:
 *   - "effective": value = effective healing, stackedValue = overhealing
 *   - "overheal": value = overhealing only (no stacked)
 *   - "total": value = total healing (effective + overheal), no stacked
 */
function aggregateForEncounters(
  result: UnifiedHealingResult,
  selectedEncounterIds: string[],
  selected: EntitySelection,
  viewMode: HealingViewMode,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData & { overhealTotal: number }>();
  
  const filterByTarget = selected.playerIds.size > 0;
  
  for (const encounterId of selectedEncounterIds) {
    const encounterHealing = result.EncounterHealingByHealer.get(encounterId);
    if (!encounterHealing) continue;
    
    for (const [playerId, data] of encounterHealing) {
      // Calculate healing - either filtered by target or total
      let effectiveValue = 0;
      let overhealValue = 0;
      
      if (filterByTarget) {
        // Sum only healing to selected players
        for (const [targetId, targetData] of data.target) {
          if (selected.playerIds.has(targetId)) {
            effectiveValue += targetData.effective;
            overhealValue += targetData.overheal;
          }
        }
      } else {
        // Use aggregate totals (faster)
        effectiveValue = data.effectiveTotal;
        overhealValue = data.overhealTotal;
      }
      
      // Determine display value based on mode
      let displayValue: number;
      let stackedValue: number | undefined;
      
      switch (viewMode) {
        case "effective":
          displayValue = effectiveValue;
          stackedValue = overhealValue > 0 ? overhealValue : undefined;
          break;
        case "overheal":
          displayValue = overhealValue;
          stackedValue = undefined;
          break;
        case "total":
          displayValue = effectiveValue + overhealValue;
          stackedValue = undefined;
          break;
      }
      
      // Skip players with zero value after filtering
      if (displayValue === 0 && (stackedValue === undefined || stackedValue === 0)) continue;
      
      const existing = aggregated.get(playerId);
      if (existing) {
        existing.value += displayValue;
        existing.overhealTotal += overhealValue;
        if (stackedValue !== undefined) {
          existing.stackedValue = (existing.stackedValue || 0) + stackedValue;
        }
      } else {
        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          specialization: data.specialization,
          value: displayValue,
          stackedValue,
          overhealTotal: overhealValue,
          // dimmed: selected.playerIds.size > 0 && !selected.playerIds.has(playerId),
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}


interface HealingDoneContentProps extends PanelRenderProps<UnifiedHealingResult> {
  sourceType?: HealingSourceType;
}

export const HealingDoneContent = (props: HealingDoneContentProps) => {
  const { sourceType = "players" } = props;
  const { result, context, panelOption, setPanelOption } = props;
  const syncMode = useSyncModeContextOptional();

  const { viewMode, showRanks, focusedPlayerId } = useMemo(() => {
    const tokens = (panelOption ?? "").split(",").map((token) => token.trim()).filter(Boolean);
    const modeToken = tokens.find((token): token is HealingViewMode => (
      token === "effective" || token === "overheal" || token === "total"
    ));
    const focusToken = tokens.find((token) => token.startsWith("f:"));

    return {
      viewMode: modeToken ?? "effective",
      showRanks: tokens.includes("noranks") ? false : true,
      focusedPlayerId: focusToken ? focusToken.slice(2) : null,
    };
  }, [panelOption]);

  const serializeOption = useCallback((nextMode: HealingViewMode, nextShowRanks: boolean, nextFocus: string | null) => {
    const tokens: string[] = [];
    if (nextMode !== "effective") tokens.push(nextMode);
    if (!nextShowRanks) tokens.push("noranks");
    if (nextFocus) tokens.push(`f:${nextFocus}`);
    return tokens.length > 0 ? tokens.join(",") : null;
  }, []);

  const updatePanelOption = (nextMode: HealingViewMode, nextShowRanks: boolean) => {
    setPanelOption?.(serializeOption(nextMode, nextShowRanks, focusedPlayerId));
  };

  const setFocusedPlayerId = useCallback((id: string | null) => {
    setPanelOption?.(serializeOption(viewMode, showRanks, id));
  }, [setPanelOption, serializeOption, viewMode, showRanks]);
  
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.EncounterHealingByHealer instanceof Map && r.EncounterHealingByHealer.size > 0,
    [sourceType, props.panelContextVersion]
  );

  const healingData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(cachedResult, context.selectedEncounterIds, context.entitySelection, viewMode);
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection, viewMode]);


  // Create breakout function for tooltips
  const breakout = useHealingDoneBreakout({
    result: result,
    context: context,
    valueLabel: viewMode === "overheal" ? "Overheal" : viewMode === "total" ? "Total" : "Effective",
    perSecond: props.perSecond,
    durationMs: props.durationMs,
    loading: props.loading,
    processing: props.processing,
    viewMode,
    showRanks,
  });

  // ── Parse pills ──
  const parsePills = useParsePills({
    metric: "hps",
    props,
    isPlayerSource: sourceType === "players",
    isFocused: !!focusedPlayerId,
  });

  // ── Focus feature: right-click a player row to show per-ability view ──

  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; playerId: string; playerName: string
  } | null>(null);

  // Handler for Ctrl+click on player rows
  const handleRowCtrlClick = useCallback((playerId: string, event: React.MouseEvent) => {
    const playerName = healingData.find(d => d.playerID === playerId)?.playerName ?? playerId;
    setContextMenu({ x: event.clientX, y: event.clientY, playerId, playerName });
  }, [healingData]);

  useEffect(() => {
    if (!focusedPlayerId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedPlayerId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedPlayerId, setFocusedPlayerId]);

  const focusedPlayer = focusedPlayerId
    ? healingData.find(d => d.playerID === focusedPlayerId)
    : null;

  const focusedAbilityData = useMemo(() => {
    if (!focusedPlayerId || !cachedResult) return null;
    const abilityMap = viewMode === "effective"
      ? cachedResult.HealerByAbility
      : viewMode === "overheal"
        ? cachedResult.HealerByAbilityOverheal
        : cachedResult.HealerByAbilityTotal;
    const abilities = abilityMap.get(focusedPlayerId);
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
  }, [focusedPlayerId, cachedResult, focusedPlayer?.className, viewMode]);

  const focusedBreakout = useCallback(
    (abilityName: string, pinned: boolean) => {
      if (!focusedPlayerId || !cachedResult) return null;
      const abilityMap = viewMode === "effective"
        ? cachedResult.HealerByAbility
        : viewMode === "overheal"
          ? cachedResult.HealerByAbilityOverheal
          : cachedResult.HealerByAbilityTotal;
      const abilities = abilityMap.get(focusedPlayerId);
      if (!abilities) return null;
      const abilityData = abilities.get(abilityName);
      if (!abilityData) return null;

      const perSec = props.perSecond && props.durationMs;
      const rawTotal = abilityData.Total;
      const displayTotal = perSec ? (rawTotal / props.durationMs) * 1000 : rawTotal;

      const singleAbility: AbilityData[] = [{
        ...abilityData,
        name: abilityName,
        value: displayTotal,
      }];

      return (
        <AbilityBreakout
          abilities={singleAbility}
          targets={[]}
          totalValue={displayTotal}
          valueLabel={props.perSecond ? "HPS" : viewMode === "overheal" ? "Overheal" : "Healing"}
          debugGuid={focusedPlayerId}
          pinned={pinned}
          activeTab="ability"
          onTabChange={() => {}}
        />
      );
    },
    [focusedPlayerId, cachedResult, viewMode, props.perSecond, props.durationMs],
  );

  // Register chart data for cross-panel comparison (registers active view's data)
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(focusedAbilityData ?? healingData);
  }, [registerChartData, focusedAbilityData, healingData]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Compute display total — use focused data when in focus mode
  const activeData = focusedAbilityData ?? healingData;
  const total = activeData.reduce((sum, d) => sum + d.value, 0);
  const stackedTotal = activeData.reduce((sum, d) => sum + (d.stackedValue || 0), 0);
  const displayTotal = props.perSecond && props.durationMs
    ? formatNumber(total / (props.durationMs / 1000), 1)
    : formatNumber(total, 0);

  // Compute overheal percentage for effective mode
  const overhealPercent = viewMode === "effective" && (total + stackedTotal) > 0
    ? ((stackedTotal / (total + stackedTotal)) * 100).toFixed(1)
    : null;

  const viewModeLabels: Record<HealingViewMode, string> = {
    effective: "Effective",
    overheal: "Overheal",
    total: "Total",
  };

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{displayTotal}{props.perSecond ? '/s' : ''}</span>
          {overhealPercent && (
            <span className="ml-2 text-muted-foreground">
              (<span className="font-mono text-yellow-500">+{overhealPercent}%</span> overheal)
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Show ranks toggle */}
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => updatePanelOption(viewMode, !showRanks)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                    showRanks
                      ? "bg-[color:var(--tertiary)]/20 text-[color:var(--tertiary)] border border-[color:var(--tertiary)]/30"
                      : "bg-muted/50 text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Layers className="h-3 w-3" />
                  Ranks
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[220px]">
                <p className="text-xs">Show spells separated by rank in the ability breakdown (e.g., Flash Heal Rank 4 vs Rank 7)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* View mode toggle */}
          <div
            className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5"
            data-healing-view-toggle
            data-lesson-target="healing-modes"
          >
            {(["effective", "overheal", "total"] as HealingViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => updatePanelOption(mode, showRanks)}
                className={cn(
                  "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                  viewMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-healing-view-mode={mode}
              >
                {viewModeLabels[mode]}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {context.entitySelection.playerIds.size > 0 && (
        <div className="text-xs text-muted-foreground italic mb-1">
          Showing healing to {context.entitySelection.playerIds.size} selected player{context.entitySelection.playerIds.size !== 1 ? 's' : ''}
        </div>
      )}
      
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

      {/* Conditionally render focused ability view or normal player view */}
      {focusedPlayerId && focusedAbilityData ? (
        <PlayerMetricChart
          data={focusedAbilityData}
          type="healing"
          panelTitle="Ability Breakdown"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          animateValues={!syncMode?.enabled}
          breakout={focusedBreakout}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      ) : (
        <PlayerMetricChart
          data={healingData}
          type="healing"
          panelTitle={viewMode === "overheal" ? "Overhealing" : "Healing Done"}
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          animateValues={!syncMode?.enabled}
          breakout={breakout}
          onRowCtrlClick={handleRowCtrlClick}
          disableInteractions={props.context.renderMode === "layout_lab"}
          parsePills={parsePills}
        />
      )}

      {/* Ctrl+click context menu */}
      {contextMenu && (
        <RowContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          playerName={contextMenu.playerName}
          onFocus={() => setFocusedPlayerId(contextMenu.playerId)}
          onClose={() => setContextMenu(null)}
          armoryUrl={getArmoryUrl(props.context.instance, contextMenu.playerId)}
        />
      )}
    </GenericPanel>
  );
}
