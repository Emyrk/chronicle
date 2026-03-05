import { useMemo } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { GenericPanel } from "../GenericPanel";
import type { EntitySelection, PanelRenderProps } from "../types";
import type { AvoidanceResult } from "../processors";
import { useCachedValue } from "@/hooks/useCachedValue";
import { cn } from "@/lib/utils";

/**
 * Aggregated avoidance data for a player across encounters.
 */
interface AggregatedAvoidance {
  playerID: string;
  playerName: string;
  className: string;
  dodge: number;
  parry: number;
  block: number;
  avoided: number;
  totalAttacks: number;
  avoidancePercent: number;
  dimmed: boolean;
}

/**
 * Aggregate avoidance data across selected encounters.
 */
function aggregateForEncounters(
  result: AvoidanceResult,
  selectedEncounterIds: string[],
  selected: EntitySelection,
): AggregatedAvoidance[] {
  const aggregated = new Map<string, AggregatedAvoidance>();
  
  const hasPlayerSelection = selected.playerIds.size > 0;
  
  for (const encounterId of selectedEncounterIds) {
    const encounterAvoidance = result.EncounterAvoidance.get(encounterId);
    if (!encounterAvoidance) continue;
    
    for (const [playerId, data] of encounterAvoidance) {
      // Skip zero values
      if (data.totalAttacks === 0) continue;
      
      const existing = aggregated.get(playerId);
      if (existing) {
        existing.dodge += data.dodge;
        existing.parry += data.parry;
        existing.block += data.block;
        existing.avoided += data.avoided;
        existing.totalAttacks += data.totalAttacks;
        // Recalculate percentage
        existing.avoidancePercent = existing.totalAttacks > 0 
          ? (existing.avoided / existing.totalAttacks) * 100 
          : 0;
      } else {
        aggregated.set(playerId, {
          playerID: data.playerID,
          playerName: data.playerName,
          className: data.className,
          dodge: data.dodge,
          parry: data.parry,
          block: data.block,
          avoided: data.avoided,
          totalAttacks: data.totalAttacks,
          avoidancePercent: data.avoidancePercent,
          dimmed: hasPlayerSelection && !selected.playerIds.has(playerId),
        });
      }
    }
  }
  
  return Array.from(aggregated.values());
}

/** Format percentage with 1 decimal place */
function formatPct(count: number, total: number): string {
  if (total === 0) return "0.0%";
  return ((count / total) * 100).toFixed(1) + "%";
}

type AvoidanceContentProps = PanelRenderProps<AvoidanceResult>;

export const AvoidanceContent = (props: AvoidanceContentProps) => {
  const { result, context } = props;
  
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.EncounterAvoidance instanceof Map && r.EncounterAvoidance.size > 0,
    [props.panelContextVersion]
  );

  const aggregatedData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(cachedResult, context.selectedEncounterIds, context.entitySelection);
  }, [cachedResult, context.selectedEncounterIds, context.entitySelection]);

  // Sort by total avoidance %, dimmed items last
  const sortedData = useMemo(() => {
    return [...aggregatedData].sort((a, b) => {
      if (a.dimmed !== b.dimmed) return a.dimmed ? 1 : -1;
      return b.avoidancePercent - a.avoidancePercent;
    });
  }, [aggregatedData]);

  // Once we have cached data, never show loading/processing states
  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  // Compute totals for summary
  const totalAvoided = aggregatedData.reduce((sum, d) => sum + d.avoided, 0);
  const totalAttacks = aggregatedData.reduce((sum, d) => sum + d.totalAttacks, 0);
  const overallPercent = totalAttacks > 0 ? (totalAvoided / totalAttacks * 100).toFixed(1) : "0";

  return (
    <GenericPanel {...effectiveProps}>
      <div className="text-xs text-muted-foreground mb-2">
        Total: <span className="font-medium text-foreground">{totalAvoided.toLocaleString()}/{totalAttacks.toLocaleString()}</span> attacks avoided (<span className="font-medium text-foreground">{overallPercent}%</span>)
      </div>
      
      <ScrollArea className="max-h-panel">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background z-10">
            <tr className="text-muted-foreground border-b border-border">
              <th className="text-left py-1.5 pl-1 pr-2 font-medium">Player</th>
              <th className="text-right py-1.5 px-1 font-medium">Dodge</th>
              <th className="text-right py-1.5 px-1 font-medium">Parry</th>
              <th className="text-right py-1.5 px-1 font-medium">Block</th>
              <th className="text-right py-1.5 pl-1 pr-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {sortedData.map((d) => (
              <tr 
                key={d.playerID} 
                className={cn(
                  "border-b border-border/50 hover:bg-muted/30",
                  d.dimmed && "opacity-40"
                )}
              >
                <td className="py-1 pl-1 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: `var(--class-${d.className.toLowerCase()})` }}
                    />
                    <span className="truncate">{d.playerName}</span>
                  </div>
                </td>
                <td className="text-right py-1 px-1 font-mono text-muted-foreground">
                  {formatPct(d.dodge, d.totalAttacks)}
                </td>
                <td className="text-right py-1 px-1 font-mono text-muted-foreground">
                  {formatPct(d.parry, d.totalAttacks)}
                </td>
                <td className="text-right py-1 px-1 font-mono text-muted-foreground">
                  {formatPct(d.block, d.totalAttacks)}
                </td>
                <td className="text-right py-1 pl-1 pr-1 font-mono font-medium">
                  {d.avoidancePercent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </GenericPanel>
  );
}
