import { useState, type MouseEvent, type ReactNode } from "react";
import { format } from "date-fns";
import { useArmoryGearHistory } from "@/api/queries";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { cn } from "@/lib/utils";
import { getClassColorVar, getQualityBorderClass, getQualityTextClass } from "../types";
import { CursorTooltip, type CursorPos } from "./CursorTooltip";
import { buildGearTimeline, gearAt, type GearSegment, type GearSlotTimeline } from "./gearTimeline";

export interface GearTimelinePlayer {
  key: string;
  id: string;
  name: string;
  className: string;
  realmName: string;
}

/** Icons closer than this (percent of the lane) collapse to a tick so they don't overlap. */
const MIN_ICON_GAP = 3;
/** Shown for items recorded without an icon. */
const FALLBACK_ICON = "INV_Misc_QuestionMark";
/** A time hovered in the run chart snaps to a gear snapshot this close (the chart works in days). */
const SNAP_MS = 36 * 60 * 60 * 1000;

const QUALITY_COLOR_VARS: Record<number, string> = {
  0: "var(--color-quality-poor)",
  1: "var(--color-quality-common)",
  2: "var(--color-quality-uncommon)",
  3: "var(--color-quality-rare)",
  4: "var(--color-quality-epic)",
  5: "var(--color-quality-legendary)",
  6: "var(--color-quality-artifact)",
};

/** Gear over time for one player; asks to pick one when several are compared. */
export function GearPanel({
  players,
  instanceName,
  rangeDays,
  hoverTime,
  onHoverTimeChange,
}: {
  players: readonly GearTimelinePlayer[];
  instanceName: string;
  rangeDays: number;
  /** A time hovered here or in the run chart. */
  hoverTime: number | null;
  onHoverTimeChange: (time: number | null) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = players.length === 1 ? players[0] : players.find((player) => player.key === selectedKey);

  if (!selected) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">Gear history shows one player at a time. Pick whose gear to show:</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {players.map((player) => (
            <button
              key={player.key}
              type="button"
              onClick={() => setSelectedKey(player.key)}
              className="rounded-md border border-border/70 px-3 py-1.5 text-sm font-medium hover:bg-white/5"
              style={{ color: getClassColorVar(player.className) }}
            >
              {player.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {players.length > 1 && (
        <button type="button" onClick={() => setSelectedKey(null)} className="text-xs text-muted-foreground hover:text-foreground">
          ← Choose a different player
        </button>
      )}
      <PlayerGearTimeline
        key={selected.key}
        player={selected}
        instanceName={instanceName}
        rangeDays={rangeDays}
        hoverTime={hoverTime}
        onHoverTimeChange={onHoverTimeChange}
      />
    </div>
  );
}

function PlayerGearTimeline({
  player,
  instanceName,
  rangeDays,
  hoverTime,
  onHoverTimeChange,
}: {
  player: GearTimelinePlayer;
  instanceName: string;
  rangeDays: number;
  hoverTime: number | null;
  onHoverTimeChange: (time: number | null) => void;
}) {
  const [raidOnly, setRaidOnly] = useState(true);
  const history = useArmoryGearHistory(player.realmName, player.id);
  const iconBaseUrl = useIconBaseUrl();
  const [hovered, setHovered] = useState<{ segment: GearSegment; slot: GearSlotTimeline; pos: CursorPos } | null>(null);

  if (history.isLoading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading gear history…</div>;

  const timeline = buildGearTimeline(history.data?.snapshots ?? [], raidOnly ? instanceName : null, rangeDays);
  const scopeToggle = (
    <div className="grid grid-cols-2 gap-1 rounded-md border border-white/10 bg-black/20 p-0.5" role="group" aria-label="Gear scope">
      {[true, false].map((option) => (
        <button
          key={String(option)}
          type="button"
          aria-pressed={raidOnly === option}
          onClick={() => setRaidOnly(option)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            raidOnly === option ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {option ? "This raid" : "All raids"}
        </button>
      ))}
    </div>
  );

  if (!timeline) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">{scopeToggle}</div>
        <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No gear recorded for {player.name} {raidOnly ? `in ${instanceName} ` : ""}in this date range.
        </div>
      </div>
    );
  }

  const span = Math.max(timeline.end - timeline.start, 1);
  const position = (time: number) => timeline.end === timeline.start ? 50 : ((time - timeline.start) / span) * 100;
  const levels = timeline.itemLevels;
  const levelLow = Math.min(...levels.map((point) => point.value));
  const levelHigh = Math.max(...levels.map((point) => point.value));
  const levelY = (value: number) => 85 - ((value - levelLow) / Math.max(levelHigh - levelLow, 1)) * 70;
  const firstLevel = levels[0];
  const lastLevel = levels[levels.length - 1];
  const nearestSnapshot = (time: number) => timeline.times.reduce((best, candidate) => (
    Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best
  ));
  // Snap a hovered time to the snapshot from that night, so the right column shows what was worn then.
  const snapped = hoverTime === null ? null : nearestSnapshot(hoverTime);
  const shownTime = snapped !== null && Math.abs(snapped - hoverTime!) <= SNAP_MS ? snapped : null;
  const lineAt = hoverTime === null || hoverTime < timeline.start - SNAP_MS || hoverTime > timeline.end + SNAP_MS
    ? null
    : position(shownTime ?? hoverTime);
  const shownLevel = shownTime === null ? lastLevel : levels.find((point) => point.time === shownTime) ?? lastLevel;
  const laneHover = {
    lineAt,
    onMove: (event: MouseEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const fraction = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
      onHoverTimeChange(nearestSnapshot(timeline.start + fraction * span));
    },
    onLeave: () => onHoverTimeChange(null),
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="text-sm">
          <span className="font-medium" style={{ color: getClassColorVar(player.className) }}>{player.name}</span>
          <span className="text-muted-foreground">
            {raidOnly ? ` in ${instanceName}` : " in all raids"} · {timeline.snapshotCount} recorded {timeline.snapshotCount === 1 ? "log" : "logs"} · {timeline.changedSlots} {timeline.changedSlots === 1 ? "slot" : "slots"} changed
          </span>
        </div>
        <div className="ml-auto">{scopeToggle}</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border/60 bg-black/10 styled-scrollbar">
        <div className="min-w-[640px] px-3 py-2">
          {levels.length > 0 && (
            <GearRow
              label="Item level"
              hover={laneHover}
              current={(
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {shownLevel.value.toFixed(1)}
                  {shownTime !== null && <span className="ml-2 font-sans text-xs font-normal text-muted-foreground">{format(new Date(shownTime), "MMM d")}</span>}
                </span>
              )}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible" aria-label={`Average item level from ${firstLevel.value.toFixed(1)} to ${lastLevel.value.toFixed(1)}`}>
                <polyline
                  points={levels.map((point) => `${position(point.time)},${levelY(point.value)}`).join(" ")}
                  fill="none"
                  stroke="var(--color-amber-400)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </GearRow>
          )}
          {timeline.slots.map((slot) => {
            const current = gearAt(slot, shownTime ?? timeline.end);
            let lastIconAt = -Infinity;
            return (
              <GearRow
                key={slot.slot}
                label={slot.label}
                hover={laneHover}
                current={current ? (
                  <span className={cn("block truncate text-xs", getQualityTextClass(current.item.item_quality ?? 1))}>
                    {current.item.item_name ?? `Item ${current.item.item_id}`}
                    {current.item.item_level != null && <span className="ml-1 text-muted-foreground">{current.item.item_level}</span>}
                  </span>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              >
                {slot.segments.map((segment, index) => {
                  const left = position(segment.start);
                  const right = position(segment.end);
                  const showIcon = left - lastIconAt >= MIN_ICON_GAP;
                  if (showIcon) lastIconAt = left;
                  const color = QUALITY_COLOR_VARS[segment.item.item_quality ?? 1] ?? QUALITY_COLOR_VARS[1];
                  const onMove = (event: MouseEvent) => setHovered({ segment, slot, pos: { x: event.clientX, y: event.clientY } });
                  return (
                    <div key={`${segment.item.item_id}-${index}`} onMouseMove={onMove} onMouseLeave={() => setHovered(null)}>
                      <span
                        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-60"
                        style={{ left: `${left}%`, width: `max(${right - left}%, 4px)`, backgroundColor: color }}
                      />
                      {showIcon ? (
                        <span
                          className={cn("absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded border bg-popover bg-cover bg-center", getQualityBorderClass(segment.item.item_quality ?? 1))}
                          style={{
                            left: `${left}%`,
                            backgroundImage: `url(${iconUrl(segment.item.item_icon || FALLBACK_ICON, iconBaseUrl)})`,
                          }}
                          aria-label={segment.item.item_name}
                        />
                      ) : (
                        <span className="absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${left}%`, backgroundColor: color }} />
                      )}
                    </div>
                  );
                })}
              </GearRow>
            );
          })}
          <GearRow label="" current={null} hover={null}>
            <div className="flex h-full items-start justify-between pt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
              <span>{format(new Date(timeline.start), "MMM d")}</span>
              <span>{format(new Date(timeline.end), "MMM d")}</span>
            </div>
          </GearRow>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Each icon marks when a slot changed, and the bar shows how long the item was worn. Gear is recorded from each uploaded log;
        moving a ring or trinket to the other slot of the pair doesn't count as a change. Hover an item for details.
      </p>

      {hovered && (
        <CursorTooltip pos={hovered.pos}>
          <div className="w-64 rounded-md border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 shadow-xl">
            <div className={cn("text-sm font-semibold", getQualityTextClass(hovered.segment.item.item_quality ?? 1))}>
              {hovered.segment.item.item_name ?? `Item ${hovered.segment.item.item_id}`}
            </div>
            <div className="mt-0.5 text-zinc-400">
              {hovered.slot.label}
              {hovered.segment.item.item_level != null && ` · item level ${hovered.segment.item.item_level}`}
            </div>
            <div className="mt-1.5">
              Worn {format(new Date(hovered.segment.start), "MMM d")}
              {hovered.segment.lastSeen !== hovered.segment.start && ` – ${format(new Date(hovered.segment.lastSeen), "MMM d")}`}
              {" "}· {hovered.segment.snapshotCount} {hovered.segment.snapshotCount === 1 ? "log" : "logs"}
            </div>
          </div>
        </CursorTooltip>
      )}
    </div>
  );
}

interface LaneHover {
  /** Marker position (percent), or null for none. */
  lineAt: number | null;
  onMove: (event: MouseEvent<HTMLDivElement>) => void;
  onLeave: () => void;
}

function GearRow({ label, current, hover, children }: { label: string; current: ReactNode; hover: LaneHover | null; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_11rem] items-center gap-3 border-b border-border/30 py-0.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      {/* Inset so icons centered on the first and last day stay inside the lane. */}
      <div className="relative mx-3 h-7" onMouseMove={hover?.onMove} onMouseLeave={hover?.onLeave}>
        {children}
        {hover?.lineAt != null && (
          <span className="pointer-events-none absolute -inset-y-1 w-px bg-white/70" style={{ left: `${hover.lineAt}%` }} />
        )}
      </div>
      <div className="min-w-0">{current}</div>
    </div>
  );
}
