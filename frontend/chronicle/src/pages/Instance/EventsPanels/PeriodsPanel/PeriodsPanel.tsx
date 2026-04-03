/**
 * PeriodsPanel - Timeline visualization of unit activity periods
 * 
 * Shows activity periods for hostiles across selected encounters.
 * Period data comes from the instance API (no event stream processing needed).
 */
/* eslint-disable react-refresh/only-export-components */

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/ScrollArea/ScrollArea";
import { HintTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { cn } from "@/lib/utils";
import type { PanelDefinition, PanelRenderProps, PanelContext } from "../types";
import type { ActivityPeriod } from "@/api/typesGenerated";
import { PeriodMomentDisplay } from "@/components/PeriodMomentDisplay";

// Periods panel doesn't process event streams - it reads from context
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface PeriodsState {
  // Empty - all data comes from context.instance.encounters
}

interface EncounterData {
  encounterID: string;
  encounterName: string;
  encounterStart: number;  // ms timestamp
  encounterEnd: number;    // ms timestamp
  periods: readonly ActivityPeriod[];
}

interface TimelineEntry {
  guid: string;
  name: string;
  boss: boolean;
  // Support multiple encounters for the same unit
  encounters: EncounterData[];
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function PeriodsTimeline({ context }: { context: PanelContext }) {
  // Extract all hostiles with periods from selected encounters, grouped by GUID
  const timelineData = useMemo(() => {
    const byGuid = new Map<string, TimelineEntry>();
    
    for (const encounter of context.instance.encounters) {
      if (!context.selectedEncounterIds.includes(encounter.id)) continue;
      
      const encStart = new Date(encounter.start_time).getTime();
      const encEnd = new Date(encounter.end_time).getTime();
      
      for (const enemy of encounter.enemies ?? []) {
        if (enemy.periods.length === 0) continue;
        
        const existing = byGuid.get(enemy.id);
        if (existing) {
          // Add this encounter's data to existing entry
          existing.encounters.push({
            encounterID: encounter.id,
            encounterName: encounter.name,
            encounterStart: encStart,
            encounterEnd: encEnd,
            periods: enemy.periods,
          });
          // Promote to boss if any encounter marks it as boss
          if (enemy.boss) existing.boss = true;
        } else {
          // Create new entry
          byGuid.set(enemy.id, {
            guid: enemy.id,
            name: enemy.name,
            boss: enemy.boss,
            encounters: [{
              encounterID: encounter.id,
              encounterName: encounter.name,
              encounterStart: encStart,
              encounterEnd: encEnd,
              periods: enemy.periods,
            }],
          });
        }
      }
    }
    
    const entries = Array.from(byGuid.values());
    
    // Sort: bosses first, then by name
    entries.sort((a, b) => {
      if (a.boss !== b.boss) return a.boss ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    
    return entries;
  }, [context.instance.encounters, context.selectedEncounterIds]);

  // Compute global time range for scaling
  const { minTime, maxTime } = useMemo(() => {
    let min = Infinity, max = -Infinity;
    for (const entry of timelineData) {
      for (const enc of entry.encounters) {
        min = Math.min(min, enc.encounterStart);
        max = Math.max(max, enc.encounterEnd);
      }
    }
    return { minTime: min, maxTime: max };
  }, [timelineData]);

  const totalDuration = maxTime - minTime;

  if (timelineData.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-8">
        No period data for selected encounters.
        <br />
        <span className="text-muted-foreground/70">
          Period data shows when hostile units are active during encounters.
        </span>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2 min-w-max">
        {/* Header */}
        <div className="flex items-center gap-2 text-[10px] font-medium text-muted-foreground mb-2 border-b pb-1">
          <span className="w-32 shrink-0">Unit</span>
          <span className="w-20 shrink-0 text-center">Enc.</span>
          <span className="flex-1 min-w-[300px]">
            Activity Timeline
            <span className="ml-2 text-muted-foreground/50">
              ({formatDuration(totalDuration)} total)
            </span>
          </span>
        </div>
        
        {timelineData.map((entry) => (
          <div 
            key={entry.guid} 
            className="flex items-center gap-2 py-1 border-b border-border/30 hover:bg-muted/20"
          >
            {/* Unit name */}
            <span 
              className={cn(
                "w-32 text-xs truncate shrink-0",
                entry.boss ? "text-yellow-400 font-medium" : "text-muted-foreground"
              )}
              title={`${entry.name} (${entry.guid})`}
            >
              {entry.name}
            </span>
            
            {/* Encounter count indicator */}
            <span 
              className="w-20 text-[10px] text-muted-foreground shrink-0 text-center" 
              title={entry.encounters.map(e => e.encounterName).join(", ")}
            >
              {entry.encounters.length === 1 
                ? entry.encounters[0].encounterName.slice(0, 8) + "..."
                : `${entry.encounters.length} enc.`}
            </span>
            
            {/* Timeline bar container */}
            <div className="flex-1 h-5 bg-muted/30 rounded relative min-w-[300px]">
              {/* Encounter boundary markers for each encounter */}
              {entry.encounters.map((enc) => {
                const encLeft = ((enc.encounterStart - minTime) / totalDuration) * 100;
                const encWidth = ((enc.encounterEnd - enc.encounterStart) / totalDuration) * 100;
                return (
                  <div
                    key={enc.encounterID}
                    className="absolute h-full border-l border-r border-muted-foreground/30"
                    style={{ left: `${encLeft}%`, width: `${encWidth}%` }}
                  />
                );
              })}
              
              {/* Period bars from all encounters */}
              {entry.encounters.flatMap((enc) =>
                enc.periods.map((period, periodIdx) => {
                  const start = period.start 
                    ? new Date(period.start.timestamp).getTime() 
                    : enc.encounterStart;
                  const end = period.end 
                    ? new Date(period.end.timestamp).getTime() 
                    : enc.encounterEnd;
                  const left = ((start - minTime) / totalDuration) * 100;
                  const width = ((end - start) / totalDuration) * 100;
                  
                  const tooltipContent = (
                    <div className="text-xs space-y-1.5">
                      <div className="font-medium">{entry.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono break-all">{entry.guid}</div>
                      <div className="text-[10px] text-muted-foreground border-b border-border pb-1 mb-1">
                        Encounter: {enc.encounterName}
                      </div>
                      <PeriodMomentDisplay 
                        moment={period.start} 
                        label="Start" 
                        fallback="encounter start"
                      />
                      <PeriodMomentDisplay 
                        moment={period.end} 
                        label="End" 
                        fallback="ongoing"
                      />
                      {period.last_active && (
                        <PeriodMomentDisplay moment={period.last_active} label="Last Active" />
                      )}
                      <div className="pt-1 font-medium">
                        Duration: {formatDuration(end - start)}
                      </div>
                      {period.end_state === "slain" && (
                        <div className="text-red-400 pt-1">💀 Slain</div>
                      )}
                      {period.end_state === "reset" && (
                        <div className="text-orange-400 pt-1">🔄 Reset</div>
                      )}
                      {period.end_state === "timeout" && (
                        <div className="text-gray-400 pt-1">⏱️ Timeout</div>
                      )}
                    </div>
                  );
                  
                  return (
                    <HintTooltip key={`${enc.encounterID}-${periodIdx}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={cn(
                            "absolute h-full rounded cursor-help transition-opacity hover:opacity-100",
                            entry.boss ? "bg-yellow-500/70" : "bg-blue-500/50",
                            period.end_state === "slain" && "border-r-2 border-red-500",
                            period.end_state === "reset" && "border-r-2 border-orange-500",
                            period.end_state === "timeout" && "border-r-2 border-gray-500"
                          )}
                          style={{ 
                            left: `${left}%`, 
                            width: `${Math.max(width, 0.5)}%`,
                            opacity: 0.8,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" hideArrow className="max-w-xs bg-popover text-popover-foreground">
                        {tooltipContent}
                      </TooltipContent>
                    </HintTooltip>
                  );
                })
              )}
            </div>
          </div>
        ))}
        
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 pt-2 border-t text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-yellow-500/70 rounded" />
            <span>Boss</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500/50 rounded" />
            <span>Trash/Add</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500/50 rounded border-r-2 border-red-500" />
            <span>💀 Slain</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500/50 rounded border-r-2 border-orange-500" />
            <span>🔄 Reset</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500/50 rounded border-r-2 border-gray-500" />
            <span>⏱️ Timeout</span>
          </div>
        </div>
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PeriodsPanel: PanelDefinition<PeriodsState, any> = {
  id: "periods",
  streams: [],  // No streams needed - data from context
  createState: (): PeriodsState => ({}),
  processEvent: () => {},  // No-op
  label: "Periods",
  icon: <Clock className="h-4 w-4" />,
  selfManagesAggregation: true,  // Don't use worker - data from context
  render: (props: PanelRenderProps<PeriodsState>) => <PeriodsTimeline context={props.context} />,
};
