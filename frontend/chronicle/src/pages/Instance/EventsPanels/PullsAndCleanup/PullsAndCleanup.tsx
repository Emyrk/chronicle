/**
 * Pulls & Cleanup panel — visualizes time gaps between boss encounters.
 *
 * Shows a zoomable/scrollable raid timeline bar (purple = boss, blue = trash,
 * orange = idle) and a scrollable list of gaps between selected encounters
 * with combat vs idle breakdowns.
 */
/* eslint-disable react-refresh/only-export-components */

import { useCallback, useMemo, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/Tooltip/tooltip";
import type { PanelDefinition, PanelRenderProps, PanelContext } from "../types";
import type { PullsAndCleanupResult } from "./pullsAndCleanup.processor";
import { pullsAndCleanupProcessor } from "./pullsAndCleanup.processor";
import type { KillType } from "@/api/typesGenerated";
import type { Encounter } from "../../InstancePage";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TimelineEncounter {
  id: string;
  name: string;
  boss: boolean;
  kill_type: KillType;
  startMs: number;
  endMs: number;
  selected: boolean;
}

/** A segment within a gap: either an encounter (boss/trash) or idle time. */
interface GapSegment {
  type: "boss" | "trash" | "idle";
  name: string;
  durationMs: number;
}

interface GapBreakdown {
  afterName: string;
  afterKillType: KillType;
  beforeName: string;
  beforeKillType: KillType;
  durationMs: number;
  combatMs: number;
  idleMs: number;
  /** Ordered segments filling this gap (encounters + idle stretches). */
  segments: GapSegment[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
  }
  return `${secs}s`;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function killTypeLabel(kt: KillType): string {
  switch (kt) {
    case "clean":
    case "partial":
      return "kill";
    case "wipe":
      return "wipe";
    case "reset":
      return "reset";
  }
}

/** Compute combat vs idle time between two selected encounters and build segments. */
function computeGapBreakdown(
  allEncounters: TimelineEncounter[],
  fromEnc: TimelineEncounter,
  toEnc: TimelineEncounter,
): { combatMs: number; idleMs: number; segments: GapSegment[] } {
  const gapStart = fromEnc.endMs;
  const gapEnd = toEnc.startMs;
  if (gapEnd <= gapStart) return { combatMs: 0, idleMs: 0, segments: [] };

  // Find encounters (including other selected ones) that overlap the gap window
  const between = allEncounters
    .filter((e) => e.id !== fromEnc.id && e.id !== toEnc.id && e.startMs < gapEnd && e.endMs > gapStart)
    .sort((a, b) => a.startMs - b.startMs);

  const segments: GapSegment[] = [];
  let cursor = gapStart;
  let combatMs = 0;

  for (const enc of between) {
    const encStart = Math.max(enc.startMs, gapStart);
    const encEnd = Math.min(enc.endMs, gapEnd);
    // Idle gap before this encounter
    if (encStart > cursor) {
      segments.push({ type: "idle", name: "Idle", durationMs: encStart - cursor });
    }
    const dur = encEnd - encStart;
    segments.push({
      type: enc.boss ? "boss" : "trash",
      name: enc.name,
      durationMs: dur,
    });
    combatMs += dur;
    cursor = encEnd;
  }
  // Trailing idle
  if (cursor < gapEnd) {
    segments.push({ type: "idle", name: "Idle", durationMs: gapEnd - cursor });
  }

  const totalGap = gapEnd - gapStart;
  const idleMs = Math.max(0, totalGap - combatMs);
  return { combatMs, idleMs, segments };
}

// ─── Colors ─────────────────────────────────────────────────────────────────

const BOSS_COLOR = "#a855f7"; // purple-500 — matches --color-dmgtype-periodic
const TRASH_COLOR = "#f59e0b"; // amber-500 — matches --color-dmgtype-direct
const GAP_COLOR = "#6b7280"; // gray-500 — matches --color-dmgtype-noengage
const MUTED_OPACITY = 0.25;

// ─── Zoom constants ─────────────────────────────────────────────────────────

const MIN_ZOOM = 1;
const MAX_ZOOM = 12;
const ZOOM_STEP = 1.15;

// ─── Timeline Bar ───────────────────────────────────────────────────────────

function TimelineBar({
  allEncounters,
  totalWindowMs,
  windowStart,
}: {
  allEncounters: TimelineEncounter[];
  totalWindowMs: number;
  windowStart: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [scrollLeft, setScrollLeft] = useState(0);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScroll = useRef(0);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      // Mouse position relative to viewport within the container
      const mouseXRatio = (e.clientX - rect.left) / rect.width;
      // Current position in content space the mouse is over
      const contentX = scrollLeft + mouseXRatio * rect.width;

      const oldZoom = zoom;
      const newZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, e.deltaY < 0 ? oldZoom * ZOOM_STEP : oldZoom / ZOOM_STEP),
      );

      // Adjust scroll so the point under the cursor stays fixed
      const scale = newZoom / oldZoom;
      const newScrollLeft = Math.max(
        0,
        Math.min(
          contentX * scale - mouseXRatio * rect.width,
          rect.width * newZoom - rect.width,
        ),
      );

      setZoom(newZoom);
      setScrollLeft(newScrollLeft);
    },
    [zoom, scrollLeft],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoom <= 1) return;
      isDragging.current = true;
      dragStartX.current = e.clientX;
      dragStartScroll.current = scrollLeft;
      e.preventDefault();
    },
    [zoom, scrollLeft],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const dx = dragStartX.current - e.clientX;
      const newScroll = Math.max(
        0,
        Math.min(dragStartScroll.current + dx, rect.width * zoom - rect.width),
      );
      setScrollLeft(newScroll);
    },
    [zoom],
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Build segments: encounter | gap | encounter | gap | ...
  const segments = useMemo(() => {
    const segs: Array<{
      type: "boss" | "trash" | "gap";
      widthPct: number;
      name: string;
      durationMs: number;
      selected: boolean;
      adjacentSelected: boolean;
      offsetMs: number;
    }> = [];
    for (let i = 0; i < allEncounters.length; i++) {
      const enc = allEncounters[i];
      const duration = enc.endMs - enc.startMs;
      segs.push({
        type: enc.boss ? "boss" : "trash",
        widthPct: (duration / totalWindowMs) * 100,
        name: enc.name,
        durationMs: duration,
        selected: enc.selected,
        adjacentSelected: false,
        offsetMs: enc.startMs - windowStart,
      });
      const next = allEncounters[i + 1];
      if (next) {
        const gapMs = Math.max(0, next.startMs - enc.endMs);
        if (gapMs > 0) {
          segs.push({
            type: "gap",
            widthPct: (gapMs / totalWindowMs) * 100,
            name: "Idle",
            durationMs: gapMs,
            selected: false,
            adjacentSelected: enc.selected && next.selected,
            offsetMs: enc.endMs - windowStart,
          });
        }
      }
    }
    return segs;
  }, [allEncounters, totalWindowMs, windowStart]);

  const contentWidth = `${zoom * 100}%`;
  const transform = `translateX(-${scrollLeft}px)`;

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">
          Raid window (first pull → last end)
        </span>
        {zoom > 1 && (
          <span className="text-[10px] text-muted-foreground/60">
            {Math.round(zoom * 100)}% · Shift+scroll to zoom · drag to pan
          </span>
        )}
      </div>

      <div
        ref={containerRef}
        className="overflow-hidden select-none"
        style={{ cursor: zoom > 1 ? "grab" : "default" }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Segmented bar */}
        <div
          className="flex h-3 rounded-full overflow-hidden"
          style={{ width: contentWidth, transform }}
        >
          {segments.map((seg, i) => {
            const color =
              seg.type === "boss"
                ? BOSS_COLOR
                : seg.type === "trash"
                  ? TRASH_COLOR
                  : GAP_COLOR;
            const isSelected =
              seg.type === "gap" ? seg.adjacentSelected : seg.selected;
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    style={{
                      width: `${seg.widthPct}%`,
                      background: color,
                      opacity: isSelected ? 1 : MUTED_OPACITY,
                      minWidth: seg.widthPct > 0 ? "1px" : undefined,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="font-medium">{seg.name}</div>
                  <div className="opacity-70">
                    {formatDuration(seg.durationMs)} · {formatTimestamp(seg.offsetMs)}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Dot markers */}
        <div className="relative h-4 mt-1" style={{ width: contentWidth, transform }}>
          {allEncounters.map((enc) => {
            const pct = ((enc.startMs - windowStart) / totalWindowMs) * 100;
            const color = enc.boss ? BOSS_COLOR : TRASH_COLOR;
            return (
              <Tooltip key={`dot-${enc.id}`}>
                <TooltipTrigger asChild>
                  <div
                    className="absolute -translate-x-1/2"
                    style={{
                      left: `${pct}%`,
                      opacity: enc.selected ? 1 : MUTED_OPACITY,
                    }}
                  >
                    <div
                      className="h-2 w-2 rounded-full border-2 bg-background"
                      style={{ borderColor: color }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <div className="font-medium">{enc.name}</div>
                  <div className="opacity-70">
                    {formatTimestamp(enc.startMs - windowStart)} –{" "}
                    {formatTimestamp(enc.endMs - windowStart)} ·{" "}
                    {killTypeLabel(enc.kill_type)}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {zoom <= 1 && (
        <div className="text-[10px] text-muted-foreground/50 text-center mt-1">
          Shift + scroll to zoom
        </div>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

function PullsAndCleanupContent({
  context,
}: {
  context: PanelContext;
}) {
  const selectedSet = useMemo(
    () => new Set(context.selectedEncounterIds),
    [context.selectedEncounterIds],
  );

  const { allEncounters, selectedEncounters, gaps, totalWindowMs } = useMemo(() => {
    const rawEncounters = context.instance.encounters;
    const all: TimelineEncounter[] = rawEncounters
      .map((e: Encounter) => ({
        id: e.id,
        name: e.name,
        boss: e.boss,
        kill_type: e.kill_type,
        startMs: new Date(e.start_time).getTime(),
        endMs: new Date(e.end_time).getTime(),
        selected: selectedSet.has(e.id),
      }))
      .sort((a, b) => a.startMs - b.startMs);

    const selected = all.filter((e) => e.selected);

    const gaps: GapBreakdown[] = [];
    for (let i = 0; i < selected.length - 1; i++) {
      const current = selected[i];
      const next = selected[i + 1];
      const totalGapMs = Math.max(0, next.startMs - current.endMs);
      const { combatMs, idleMs, segments } = computeGapBreakdown(all, current, next);
      gaps.push({
        afterName: current.name,
        afterKillType: current.kill_type,
        beforeName: next.name,
        beforeKillType: next.kill_type,
        durationMs: totalGapMs,
        combatMs,
        idleMs,
        segments,
      });
    }

    const totalWindowMs =
      all.length >= 2
        ? all[all.length - 1].endMs - all[0].startMs
        : 0;

    return { allEncounters: all, selectedEncounters: selected, gaps, totalWindowMs };
  }, [context.instance.encounters, selectedSet]);

  if (selectedEncounters.length < 2) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Select at least 2 encounters to see time between pulls.
      </div>
    );
  }

  const totalGapMs = gaps.reduce((sum, g) => sum + g.durationMs, 0);
  const maxGapMs = Math.max(...gaps.map((g) => g.durationMs), 1);
  const windowStart = allEncounters[0].startMs;

  return (
    <ScrollArea className="max-h-panel">
    <div className="space-y-4 p-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-sm"
            style={{ background: BOSS_COLOR }}
          />
          Boss
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-sm"
            style={{ background: TRASH_COLOR }}
          />
          Trash
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-5 rounded-sm"
            style={{ background: GAP_COLOR }}
          />
          Idle
        </span>
      </div>

      {/* Timeline */}
      <TimelineBar
        allEncounters={allEncounters}
        totalWindowMs={totalWindowMs}
        windowStart={windowStart}
      />

      {/* Gap list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold">Time between pulls</h4>
          <span className="text-xs text-muted-foreground">
            Total {formatDuration(totalGapMs)}
          </span>
        </div>

          <div className="space-y-3">
            {gaps.map((gap, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    After{" "}
                    <span className="font-semibold text-foreground">
                      {gap.afterName}
                    </span>{" "}
                    ({killTypeLabel(gap.afterKillType)})
                    <span className="mx-1.5 text-muted-foreground/50">→</span>
                    <span className="font-semibold text-foreground">
                      {gap.beforeName}
                    </span>{" "}
                    ({killTypeLabel(gap.beforeKillType)})
                  </span>
                  <span
                    className="font-mono text-sm font-medium tabular-nums ml-3 shrink-0 text-foreground"
                  >
                    {formatDuration(gap.durationMs)}
                  </span>
                </div>
                {/* Segmented mini bar — same style as main timeline */}
                {gap.durationMs > 0 && (
                  <div
                    className="flex h-1.5 rounded-full overflow-hidden bg-muted/30"
                    style={{ width: `${(gap.durationMs / maxGapMs) * 100}%` }}
                  >
                    {gap.segments.map((seg, j) => {
                      const color =
                        seg.type === "boss"
                          ? BOSS_COLOR
                          : seg.type === "trash"
                            ? TRASH_COLOR
                            : GAP_COLOR;
                      const pct = (seg.durationMs / gap.durationMs) * 100;
                      return (
                        <Tooltip key={j}>
                          <TooltipTrigger asChild>
                            <div
                              style={{
                                width: `${pct}%`,
                                background: color,
                                minWidth: pct > 0 ? "2px" : undefined,
                              }}
                            />
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="text-xs">
                            <div className="font-medium">{seg.name}</div>
                            <div className="opacity-70">{formatDuration(seg.durationMs)}</div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                  </div>
                )}
                {/* Combat / idle breakdown summary */}
                {(gap.combatMs > 0 || gap.idleMs > 0) && (
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pl-0.5">
                    {gap.combatMs > 0 && (
                      <span>
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle"
                          style={{ background: TRASH_COLOR }}
                        />
                        {formatDuration(gap.combatMs)} in combat
                      </span>
                    )}
                    {gap.idleMs > 0 && (
                      <span>
                        <span
                          className="inline-block h-1.5 w-1.5 rounded-full mr-1 align-middle"
                          style={{ background: GAP_COLOR }}
                        />
                        {formatDuration(gap.idleMs)} idle
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}

            {gaps.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-2">
                No gaps between selected encounters.
              </div>
            )}
          </div>
      </div>
    </div>
    </ScrollArea>
  );
}

// ─── Panel Definition ───────────────────────────────────────────────────────

export function createPullsAndCleanupPanel(): PanelDefinition<
  PullsAndCleanupResult,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any
> {
  return {
    ...pullsAndCleanupProcessor,
    label: "Pulls & Cleanup",
    icon: <Timer className="h-4 w-4" />,
    selfManagesAggregation: true,
    render: (props: PanelRenderProps<PullsAndCleanupResult>) => (
      <PullsAndCleanupContent context={props.context} />
    ),
  };
}
