/**
 * Aura Uptime Content - Main content component for the Aura Uptime panel
 * 
 * Shows one row per selected aura with aggregated uptime across filtered targets.
 * When a player/enemy is selected, filters to only that unit's data.
 */

import { useMemo } from "react";
import type { PanelRenderProps } from "../types";
import { type AuraUptimeResult } from "./auraUptime.processor";
import { GenericPanel } from "../GenericPanel";
import { AuraSelector } from "./AuraSelector";
import { UptimeTimeline, type DisplaySegment } from "./UptimeTimeline";
import { useCachedValue } from "@/hooks/useCachedValue";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip";

/**
 * Format uptime as percentage
 */
function formatUptimePercent(uptimeMs: number, totalMs: number): string {
  if (totalMs <= 0) return "0%";
  const percent = (uptimeMs / totalMs) * 100;
  return `${percent.toFixed(1)}%`;
}

/**
 * Format uptime as duration (m:ss)
 */
function formatUptimeDuration(uptimeMs: number): string {
  const totalSeconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Parse comma-separated aura string to array */
function parseSelectedAuras(selected: string | null): string[] {
  if (!selected) return [];
  return selected.split(",").filter(Boolean);
}

/** Row data for a single target + aura combination */
interface TargetAuraRow {
  targetGuid: string;
  targetName: string;
  auraName: string;
  spellId: number | null;
  applicationCount: number;
  totalUptimeMs: number;
  segments: DisplaySegment[];
}

export function AuraUptimeContent(props: PanelRenderProps<AuraUptimeResult>) {
  const { result, context, durationMs, panelOption, setPanelOption, checkboxChecked } = props;
  
  // When checkbox is checked, show duration instead of percentage
  const showDuration = checkboxChecked;
  
  // Cache result to avoid flicker during loading
  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => r.auraNames.length > 0,
    [
      props.context.selectedEncounterIds,
      props.context.entitySelection.enemyIds,
      props.context.entitySelection.playerIds,
      props.panelContextVersion,
    ]
  );
  
  // Build sorted aura list (auraNames is already an array for serialization)
  const sortedAuras = useMemo(() => {
    if (!cachedResult) return [];
    return [...cachedResult.auraNames].sort((a, b) => a.localeCompare(b));
  }, [cachedResult]);
  
  // Parse selected auras (comma-separated string)
  const selectedAuras = useMemo(() => parseSelectedAuras(panelOption ?? null), [panelOption]);
  
  // Get filtered target GUIDs based on entity selection
  const filteredTargetGuids = useMemo((): Set<string> | null => {
    const { playerIds, enemyIds } = context.entitySelection;
    
    // If no specific selection, return null (show all)
    if (playerIds.size === 0 && enemyIds.size === 0) {
      return null;
    }
    
    // Combine selected players and enemies
    return new Set([...playerIds, ...enemyIds]);
  }, [context.entitySelection]);
  
  // Compute cumulative offsets for each encounter (for multi-encounter timeline)
  // Each encounter's events have offsets relative to that encounter's start (0ms).
  // When displaying a unified timeline, we need to shift later encounters forward.
  const encounterOffsets = useMemo((): Map<string, number> => {
    const offsets = new Map<string, number>();
    let cumulative = 0;
    
    // Iterate encounters in order - selectedEncounterIds controls which are included
    for (const encounter of context.instance.encounters) {
      if (!context.selectedEncounterIds.includes(encounter.id)) continue;
      
      offsets.set(encounter.id, cumulative);
      const duration = new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime();
      cumulative += duration;
    }
    return offsets;
  }, [context.instance.encounters, context.selectedEncounterIds]);
  
  // Build encounter name lookup (for tooltip display)
  const encounterNames = useMemo((): Map<string, string> => {
    const names = new Map<string, string>();
    for (const encounter of context.instance.encounters) {
      names.set(encounter.id, encounter.name);
    }
    return names;
  }, [context.instance.encounters]);
  
  // Build per-target per-aura row data, filtered by selected entities
  const rows = useMemo((): TargetAuraRow[] => {
    if (!cachedResult || selectedAuras.length === 0) return [];
    
    const result: TargetAuraRow[] = [];
    
    for (const auraName of selectedAuras) {
      const auraData = cachedResult.byAura.get(auraName);
      if (!auraData) continue;
      
      for (const [guid, targetData] of auraData.perTarget) {
        // Filter by selected entities if any are selected
        if (filteredTargetGuids !== null && !filteredTargetGuids.has(guid)) {
          continue;
        }
        
        // Transform segments to unified timeline offsets with metadata for tooltips
        // Only include encounter name if multiple encounters are selected
        const showEncounterName = context.selectedEncounterIds.length > 1;
        const adjustedSegments: DisplaySegment[] = targetData.segments
          .map(seg => {
            const encounterOffset = encounterOffsets.get(seg.encounterId) ?? 0;
            return {
              ...seg,
              startMs: seg.startMs + encounterOffset,
              endMs: seg.endMs + encounterOffset,
              encounterName: showEncounterName ? encounterNames.get(seg.encounterId) : undefined,
            };
          })
          // Sort by start time for gap calculation
          .sort((a, b) => a.startMs - b.startMs);
        
        // Calculate gaps between segments
        for (let i = 1; i < adjustedSegments.length; i++) {
          const prevEnd = adjustedSegments[i - 1].endMs;
          const currentStart = adjustedSegments[i].startMs;
          adjustedSegments[i].gapBeforeMs = currentStart - prevEnd;
        }
        
        result.push({
          targetGuid: guid,
          targetName: targetData.name,
          auraName,
          spellId: auraData.spellId,
          applicationCount: targetData.applicationCount,
          totalUptimeMs: targetData.totalUptimeMs,
          segments: adjustedSegments,
        });
      }
    }
    
    // Sort by uptime descending
    return result.sort((a, b) => b.totalUptimeMs - a.totalUptimeMs);
  }, [cachedResult, selectedAuras, filteredTargetGuids, encounterOffsets, encounterNames]);
  
  // Summary text for filter state
  const filterSummary = useMemo(() => {
    if (filteredTargetGuids === null) return null;
    
    const { playerIds, enemyIds } = context.entitySelection;
    const players = context.instance.players;
    
    if (playerIds.size === 1 && enemyIds.size === 0) {
      const playerId = [...playerIds][0];
      const name = players?.[playerId]?.name ?? playerId;
      return name;
    }
    if (enemyIds.size === 1 && playerIds.size === 0) {
      const enemyId = [...enemyIds][0];
      // Enemy names aren't readily available in context, just show count
      return enemyId;
    }
    
    const total = playerIds.size + enemyIds.size;
    return `${total} units`;
  }, [filteredTargetGuids, context.entitySelection, context.instance.players]);
  
  // Get CSS class color variable for a player
  const getTargetColor = (guid: string): string | undefined => {
    const players = context.instance.players;
    if (!players) return undefined;
    const playerClass = players[guid]?.class;
    return playerClass ? `var(--class-${playerClass.toLowerCase()})` : undefined;
  };
  
  const handleAuraChange = (aura: string | null) => {
    setPanelOption?.(aura);
  };

  return (
    <GenericPanel {...props}>
      <div className="space-y-2 min-h-panel">
        {/* Aura selector */}
        <div className="flex items-center gap-2">
          <AuraSelector
            auras={sortedAuras}
            selected={panelOption ?? null}
            onChange={handleAuraChange}
          />
          {hasData && (
            <span className="text-2xs text-muted-foreground">
              {sortedAuras.length} auras
            </span>
          )}
        </div>

        {/* Content */}
        {selectedAuras.length > 0 && rows.length > 0 ? (
          <div className="@container space-y-2 min-h-panel">
            {/* Filter indicator */}
            {filterSummary && (
              <div className="text-2xs text-muted-foreground">
                Filtered to <span className="font-medium text-foreground">{filterSummary}</span>
              </div>
            )}

            {/* Per-target per-aura table */}
            <ScrollArea className="max-h-panel">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card">
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-1 px-1 font-medium">Target</th>
                    <th className="text-left py-1 px-1 font-medium">Aura</th>
                    <th className="text-center py-1 px-1 font-medium w-10">Ct</th>
                    <th className="text-right py-1 px-1 font-medium w-14">Uptime</th>
                    {/* Inline timeline - hidden in small containers */}
                    <th className="hidden @lg:table-cell py-1 px-1 font-medium">
                      <span className="sr-only">Timeline</span>
                      Duration {formatTimeCompact(durationMs)}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const classColor = getTargetColor(row.targetGuid);
                    
                    return (
                      <tr
                        key={`${row.targetGuid}-${row.auraName}`}
                        className="border-b border-border/10 hover:bg-muted/50"
                      >
                        <td
                          className="py-0.5 px-1 font-medium truncate max-w-[85px]"
                          style={{ color: classColor }}
                        >
                          {row.targetName}
                        </td>
                        <td className="py-0.5 px-1 truncate max-w-[90px] text-muted-foreground">
                          <SpellIdTooltip 
                            spellId={row.spellId} 
                            name={row.auraName} 
                            size={14}
                          />
                        </td>
                        <td className="py-0.5 px-1 text-center font-mono text-2xs text-muted-foreground">
                          {row.applicationCount}
                        </td>
                        <td className="py-0.5 px-1 text-right font-mono text-2xs">
                          {showDuration 
                            ? formatUptimeDuration(row.totalUptimeMs)
                            : formatUptimePercent(row.totalUptimeMs, durationMs)
                          }
                        </td>
                        <td className="hidden @lg:table-cell py-0.5 px-1 w-3/5">
                          <UptimeTimeline
                            segments={row.segments}
                            totalDurationMs={durationMs}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollArea>
          </div>
        ) : selectedAuras.length > 0 ? (
          <div className="text-xs text-muted-foreground text-center min-h-panel flex items-center justify-center">
            No data for selected auras{filterSummary ? ` on ${filterSummary}` : ""}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground text-center min-h-panel flex items-center justify-center">
            {hasData ? "Select auras to view uptime" : "No auras recorded"}
          </div>
        )}
      </div>
    </GenericPanel>
  );
}

/**
 * Format milliseconds to compact time string
 */
function formatTimeCompact(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes === 0) {
    return `${seconds}sec`;
  }
  if (seconds === 0) {
    return `${minutes}min`;
  }
  return `${minutes}min ${seconds}sec`;
}