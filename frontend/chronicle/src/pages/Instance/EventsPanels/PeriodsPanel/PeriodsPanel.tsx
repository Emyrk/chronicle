/**
 * PeriodsPanel - Timeline visualization of unit activity periods
 * 
 * Shows activity periods for hostiles across selected encounters.
 * Period data comes from the instance API (no event stream processing needed).
 */
/* eslint-disable react-refresh/only-export-components */

import { useMemo } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PanelDefinition, PanelRenderProps, PanelContext } from "../types";
import {
  TemporalTimeline,
  TemporalTimelineHeader,
  TemporalTimelineInterval,
  TemporalTimelineLegend,
  TemporalTimelineLegendItem,
  TemporalTimelineRow,
  TemporalTimelineTrack,
} from "../TemporalTimeline";
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
    <TemporalTimeline>
      <TemporalTimelineHeader
        label="Unit"
        title="Activity Timeline"
        duration={formatDuration(totalDuration)}
        secondaryColumn={<span className="w-20 shrink-0 text-center">Enc.</span>}
      />

      {timelineData.map((entry) => (
        <TemporalTimelineRow
          key={entry.guid}
          label={(
            <span
              className={cn(
                "block truncate text-xs",
                entry.boss ? "font-medium text-yellow-400" : "text-muted-foreground",
              )}
              title={`${entry.name} (${entry.guid})`}
            >
              {entry.name}
            </span>
          )}
          secondaryColumn={(
            <span
              className="w-20 shrink-0 text-center text-[10px] text-muted-foreground"
              title={entry.encounters.map((encounter) => encounter.encounterName).join(", ")}
            >
              {entry.encounters.length === 1
                ? `${entry.encounters[0].encounterName.slice(0, 8)}...`
                : `${entry.encounters.length} enc.`}
            </span>
          )}
        >
          <TemporalTimelineTrack
            rangeStartMs={minTime}
            rangeEndMs={maxTime}
            encounters={context.instance.encounters.filter((encounter) =>
              entry.encounters.some((entryEncounter) => entryEncounter.encounterID === encounter.id),
            )}
          >
            {entry.encounters.flatMap((encounter) =>
              encounter.periods.map((period, periodIdx) => {
                const start = period.start
                  ? new Date(period.start.timestamp).getTime()
                  : encounter.encounterStart;
                const end = period.end
                  ? new Date(period.end.timestamp).getTime()
                  : encounter.encounterEnd;

                return (
                  <TemporalTimelineInterval
                    key={`${encounter.encounterID}-${periodIdx}`}
                    startMs={start}
                    endMs={end}
                    rangeStartMs={minTime}
                    rangeEndMs={maxTime}
                    className={cn(
                      entry.boss ? "bg-yellow-500/70" : "bg-blue-500/50",
                      period.end_state === "slain" && "border-r-2 border-red-500",
                      period.end_state === "reset" && "border-r-2 border-orange-500",
                      period.end_state === "timeout" && "border-r-2 border-gray-500",
                    )}
                    tooltip={(
                      <div className="space-y-1.5 text-xs">
                        <div className="font-medium">{entry.name}</div>
                        <div className="break-all font-mono text-[10px] text-muted-foreground">
                          {entry.guid}
                        </div>
                        <div className="mb-1 border-b border-border pb-1 text-[10px] text-muted-foreground">
                          Encounter: {encounter.encounterName}
                        </div>
                        <PeriodMomentDisplay
                          moment={period.start}
                          label="Start"
                          fallback="encounter start"
                        />
                        <PeriodMomentDisplay moment={period.end} label="End" fallback="ongoing" />
                        {period.last_active && (
                          <PeriodMomentDisplay moment={period.last_active} label="Last Active" />
                        )}
                        <div className="pt-1 font-medium">
                          Duration: {formatDuration(end - start)}
                        </div>
                        {period.end_state === "slain" && (
                          <div className="pt-1 text-red-400">💀 Slain</div>
                        )}
                        {period.end_state === "reset" && (
                          <div className="pt-1 text-orange-400">🔄 Reset</div>
                        )}
                        {period.end_state === "timeout" && (
                          <div className="pt-1 text-gray-400">⏱️ Timeout</div>
                        )}
                      </div>
                    )}
                  />
                );
              }),
            )}
          </TemporalTimelineTrack>
        </TemporalTimelineRow>
      ))}

      <TemporalTimelineLegend>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded bg-yellow-500/70" />}>
          Boss
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded bg-blue-500/50" />}>
          Trash/Add
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded border-r-2 border-red-500 bg-blue-500/50" />}>
          💀 Slain
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded border-r-2 border-orange-500 bg-blue-500/50" />}>
          🔄 Reset
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded border-r-2 border-gray-500 bg-blue-500/50" />}>
          ⏱️ Timeout
        </TemporalTimelineLegendItem>
      </TemporalTimelineLegend>
    </TemporalTimeline>
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
