import { useMemo, useState } from "react";
import { Layers } from "lucide-react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { UnifiedHealingResult } from "../processors";
import type { HealingSourceType } from "./HealingDone";
import { useCachedValue } from "@/hooks/useCachedValue";
import { useHealingDoneBreakout } from "./HealingDoneBreakout";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/Tooltip/tooltip";

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
  const { result, context } = props;
  const [viewMode, setViewMode] = useState<HealingViewMode>("effective");
  const [showRanks, setShowRanks] = useState(false);
  
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => r.EncounterHealingByHealer.size > 0,
    [sourceType]
  );

  const healingData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(cachedResult, context.selectedEncounterIds, context.entitySelection, viewMode);
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection, viewMode]);


  // Create breakout function for tooltips
  const breakout = useHealingDoneBreakout({
    result: result,
    context: context,
    valueLabel: viewMode === "overheal" ? "Overheal" : "Effective",
    perSecond: props.perSecond,
    durationMs: props.durationMs,
    loading: props.loading,
    processing: props.processing,
    viewMode,
    showRanks,
  });

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Compute display total
  const total = healingData.reduce((sum, d) => sum + d.value, 0);
  const stackedTotal = healingData.reduce((sum, d) => sum + (d.stackedValue || 0), 0);
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
                  onClick={() => setShowRanks(!showRanks)}
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
          >
            {(["effective", "overheal", "total"] as HealingViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
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
      
      <PlayerMetricChart 
        data={healingData} 
        type={"healing"} 
        panelTitle={viewMode === "overheal" ? "Overhealing" : "Healing Done"}
        duration_millis={props.durationMs}
        perSecond={props.perSecond}
        breakout={breakout}
        disableInteractions={props.context.renderMode === "layout_lab"}
      />
    </GenericPanel>
  );
}
