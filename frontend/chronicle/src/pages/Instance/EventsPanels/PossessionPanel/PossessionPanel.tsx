/**
 * PossessionPanel — Timeline visualization of mind control / possession intervals.
 *
 * Shows when hostile units are temporarily controlled by players,
 * rendered as horizontal bars similar to the Periods panel.
 */
/* eslint-disable react-refresh/only-export-components */

import { useMemo } from "react";
import { Brain } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  TemporalTimeline,
  TemporalTimelineHeader,
  TemporalTimelineInterval,
  TemporalTimelineLegend,
  TemporalTimelineLegendItem,
  TemporalTimelineRow,
  TemporalTimelineTrack,
} from "../TemporalTimeline";
import { possessionProcessor, type PossessionResult, type PossessionInterval } from "./possession.processor";

// ── Constants ────────────────────────────────────────────────────────────────

const AFFILIATION_COLORS: Record<number, { bar: string; label: string }> = {
  0: { bar: "bg-gray-500/60",    label: "Unknown" },
  1: { bar: "bg-emerald-500/60", label: "Friendly" },
  2: { bar: "bg-red-500/60",     label: "Hostile" },
  3: { bar: "bg-yellow-500/60",  label: "Neutral" },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

interface TimelineRow {
  targetGuid: string;
  targetName: string;
  intervals: PossessionInterval[];
}

// ── Component ────────────────────────────────────────────────────────────────

function PossessionTimeline(props: PanelRenderProps<PossessionResult>) {
  const { result, context } = props;

  // Resolve names and group intervals by target GUID
  const rows = useMemo(() => {
    const byTarget = new Map<string, TimelineRow>();
    for (const iv of result.intervals) {
      // Filter to selected encounters
      if (!context.selectedEncounterIds.includes(iv.encounterID)) continue;

      let row = byTarget.get(iv.targetGuid);
      if (!row) {
        const name =
          context.instance.units?.[iv.targetGuid]?.name ??
          context.instance.players?.[iv.targetGuid]?.name ??
          iv.targetGuid.slice(-8);
        row = { targetGuid: iv.targetGuid, targetName: name, intervals: [] };
        byTarget.set(iv.targetGuid, row);
      }
      row.intervals.push(iv);
    }
    // Sort by name
    return Array.from(byTarget.values()).sort((a, b) =>
      a.targetName.localeCompare(b.targetName),
    );
  }, [result.intervals, context.selectedEncounterIds, context.instance.units, context.instance.players]);

  // Global time range from selected encounters (ms timestamps)
  const { minTime, maxTime } = useMemo(() => {
    let min = Infinity,
      max = -Infinity;
    for (const enc of context.instance.encounters) {
      if (!context.selectedEncounterIds.includes(enc.id)) continue;
      const s = new Date(enc.start_time).getTime();
      const e = new Date(enc.end_time).getTime();
      if (s < min) min = s;
      if (e > max) max = e;
    }
    return { minTime: min, maxTime: max };
  }, [context.instance.encounters, context.selectedEncounterIds]);

  const totalDuration = maxTime - minTime;

  if (rows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-8">
        No possession events in selected encounters.
        <br />
        <span className="text-muted-foreground/70">
          Possession data shows when hostile units are mind-controlled by players.
        </span>
      </div>
    );
  }

  // Build encounter start lookup: encounterID → ms timestamp
  const encounterStarts = new Map<string, number>();
  for (const enc of context.instance.encounters) {
    encounterStarts.set(enc.id, new Date(enc.start_time).getTime());
  }

  // Resolve controller name helper
  const controllerName = (guid: string): string =>
    context.instance.players?.[guid]?.name ??
    context.instance.units?.[guid]?.name ??
    guid.slice(-8);

  return (
    <TemporalTimeline>
      <TemporalTimelineHeader
        label="Unit"
        title="Possession Timeline"
        duration={formatDuration(totalDuration)}
      />

      {rows.map((row) => (
        <TemporalTimelineRow
          key={row.targetGuid}
          label={(
            <span
              className="block truncate text-xs text-red-400"
              title={`${row.targetName} (${row.targetGuid})`}
            >
              {row.targetName}
            </span>
          )}
        >
          <TemporalTimelineTrack
            rangeStartMs={minTime}
            rangeEndMs={maxTime}
            encounters={context.instance.encounters.filter((encounter) =>
              context.selectedEncounterIds.includes(encounter.id),
            )}
          >
            {row.intervals.map((iv, idx) => {
              const encStart = encounterStarts.get(iv.encounterID) ?? minTime;
              const absStart = encStart + iv.startOffsetMilli;
              const absEnd = iv.endOffsetMilli != null
                ? encStart + iv.endOffsetMilli
                : maxTime;
              const cName = controllerName(iv.controllerGuid);
              const duration = iv.endOffsetMilli != null
                ? iv.endOffsetMilli - iv.startOffsetMilli
                : null;
              const affil = AFFILIATION_COLORS[iv.affiliation] ?? AFFILIATION_COLORS[0];

              return (
                <TemporalTimelineInterval
                  key={`${iv.encounterID}-${idx}`}
                  startMs={absStart}
                  endMs={absEnd}
                  rangeStartMs={minTime}
                  rangeEndMs={maxTime}
                  className={`${affil.bar}${iv.endOffsetMilli == null ? " border-r-2 border-dashed border-white/40" : ""}`}
                  tooltip={(
                    <div className="space-y-1 text-xs">
                      <div className="font-medium text-red-400">{row.targetName}</div>
                      <div className="break-all font-mono text-[10px] text-muted-foreground">
                        {row.targetGuid}
                      </div>
                      <div className="text-[10px]">
                        Affiliation: <span className="font-medium">{affil.label}</span>
                      </div>
                      <div className="pt-1">
                        <span className="text-emerald-400">Controlled by:</span>{" "}
                        {cName}
                      </div>
                      {iv.spellId > 0 && (
                        <div className="text-muted-foreground">Spell ID: {iv.spellId}</div>
                      )}
                      <div className="pt-1 font-medium">
                        Duration: {duration != null ? formatDuration(duration) : "ongoing"}
                      </div>
                    </div>
                  )}
                />
              );
            })}
          </TemporalTimelineTrack>
        </TemporalTimelineRow>
      ))}

      <TemporalTimelineLegend>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded bg-emerald-500/60" />}>
          Friendly
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded bg-red-500/60" />}>
          Hostile
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem marker={<div className="h-3 w-3 rounded bg-yellow-500/60" />}>
          Neutral
        </TemporalTimelineLegendItem>
        <TemporalTimelineLegendItem
          marker={<div className="h-3 w-3 rounded border-r-2 border-dashed border-white/40 bg-gray-500/60" />}
        >
          Ongoing
        </TemporalTimelineLegendItem>
      </TemporalTimelineLegend>
    </TemporalTimeline>
  );
}

// ── Panel Definition ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createPossessionPanel(): PanelDefinition<PossessionResult, any> {
  return {
    ...possessionProcessor,
    label: "Possession",
    icon: <Brain className="h-4 w-4" />,
    render: (props: PanelRenderProps<PossessionResult>) => <PossessionTimeline {...props} />,
  };
}
