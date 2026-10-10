import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Minus, Pin, Plus } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { hitTypeNames } from "@/lib/hittype/hittype";
import { cn } from "@/lib/utils";
import {
  alignOffsetMs,
  busySegments,
  castEndMs,
  castEnds,
  castKind,
  castSlotEnd,
  damageLead,
  dpsSeries,
  idleGaps,
  nearbyActivity,
  type NearbyActivity,
  type TimelineMetric,
  playerCasts,
  playerStats,
  DEFAULT_IDLE_THRESHOLD_MS,
  type IdleGap,
  type PlayerStats,
} from "./derive";
import { TooltipHeader, TooltipShell, type TooltipAnchor } from "./TimelineTooltip";
import { CAST_SOURCE_LABELS, formatClock, SLOT_COLORS, SLOT_LABELS, swingColor, tickStepMs } from "./format";
import {
  AUTO_ATTACK_SPELL_ID,
  DAMAGE_BIN_MS,
  type PlayerTimelineData,
  type TimelineCast,
  type TimelineSwing,
} from "./rotationTimeline.processor";
import { IndicatorLine } from "./IndicatorLine";
import { KeybindsButton } from "./KeybindsButton";
import { TIMELINE_KEYBINDS, type Keybind } from "./keybinds";
import { COOLDOWN_COLORS, laneLayout, type LaneLayout } from "./laneLayout";
import { clusterRailEvents, MAX_STACKED_ICONS, type RailCluster, type RailEvent } from "./railClusters";
import { RotationOverview } from "./RotationOverview";
import type { SpellMeta } from "./useSpellMeta";
import type { RotationView } from "./useRotationView";
import type { GcdLookup } from "./derive";

/** A spell drawn as a cooldown: how long it tints the lane, and optionally its color. */
export interface CooldownInfo {
  durationMs: number;
  /** Fixed ring/tint color (from a spell override); otherwise one is assigned. */
  color?: string;
}

export interface RotationTimelinePlayer {
  guid: string;
  name: string;
  className: string;
  data: PlayerTimelineData;
}

export interface RotationTimelineProps {
  players: readonly RotationTimelinePlayer[];
  view: RotationView;
  spellMeta: (spellId: number | null) => SpellMeta;
  gcd: GcdLookup;
  /**
   * Curated cooldowns: casts of these spells sit on the rail as squares and
   * tint the lane for their duration (0 when unknown or hidden).
   */
  cooldownInfo: (spellId: number) => CooldownInfo | null;
  unitName: (guid: string) => string;
  /** Rendered after the title, e.g. player pickers. */
  headerStart?: ReactNode;
  showOverview?: boolean;
  idleThresholdMs?: number;
  /**
   * Whether the log tells main-hand and off-hand swings apart (only the
   * 1.12a-cc-addon format does). Otherwise swings are one row of "Auto attack".
   */
  swingHandKnown?: boolean;
  /** Extra shortcuts the owner handles (e.g. the page's Shift+click flip), listed after the timeline's. */
  extraKeybinds?: readonly Keybind[];
  /** Rendered under the lanes, e.g. the page's aura section. */
  children?: ReactNode;
}

interface DerivedPlayer {
  player: RotationTimelinePlayer;
  slot: number;
  /** Every cast; idle time and stats use these. */
  casts: TimelineCast[];
  /** Casts drawn on the timeline: ignored spells removed. */
  shownCasts: TimelineCast[];
  /** Shown casts the player pressed (no procs), for the last/next readout. */
  actions: TimelineCast[];
  /** When each cast or channel finished (cut short by the next cast). */
  ends: Map<TimelineCast, number>;
  offsetMs: number;
  gaps: IdleGap[];
  busy: IdleGap[];
  stats: PlayerStats;
}

const LABEL_WIDTH = 220;
/** Pointer movement under this many px is a click, not a drag. */
const CLICK_SLOP_PX = 4;
const SWING_LANE_H = 24;
/** Ring color for consumables on the rail. */
const CONSUME_COLOR = "#34d399"; // emerald-400

/** Yellow border marking a cast that crit (in the current DPS/HPS metric). */
const CRIT_RING = "0 0 0 1px rgba(0,0,0,0.6), 0 0 0 2px var(--color-school-holy)";

function isCrit(cast: TimelineCast, metric: TimelineMetric): boolean {
  return metric === "healing" ? cast.healCrits > 0 : cast.crits > 0;
}

/** Idle gaps get a duration label once they are this wide. */
const IDLE_LABEL_MIN_PX = 30;

/** Tracks an element's width; returns a callback ref, the width, and the element. */
function useElementWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width, el] as const;
}

/** Where a lane tooltip attaches, in viewport coordinates of the window it renders in. */

function SlotBadge({ slot }: { slot: number }) {
  return (
    <span
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] text-[10px] font-bold text-background"
      style={{ background: SLOT_COLORS[slot] }}
    >
      {SLOT_LABELS[slot]}
    </span>
  );
}

export function RotationTimeline({
  players,
  view,
  spellMeta,
  gcd,
  cooldownInfo,
  unitName,
  headerStart,
  showOverview = true,
  idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS,
  extraKeybinds = [],
  swingHandKnown = false,
  children,
}: RotationTimelineProps) {
  const [trackRef, trackWidth, trackEl] = useElementWidth<HTMLDivElement>();
  const rootRef = useRef<HTMLDivElement>(null);
  // Latest values for the native wheel listener below.
  const wheelRef = useRef({ panBy: view.panBy, msPerPx: 0 });
  const msPerPx = trackWidth > 0 ? (view.endMs - view.startMs) / trackWidth : 0;
  useEffect(() => {
    wheelRef.current = { panBy: view.panBy, msPerPx };
  }, [view.panBy, msPerPx]);

  // Shift+wheel (or a horizontal trackpad swipe) pans the timeline. Native and
  // non-passive so it can stop the page from scrolling instead.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horizontal) return;
      const { panBy, msPerPx } = wheelRef.current;
      if (msPerPx === 0) return;
      // Browsers report shift+wheel as deltaX or deltaY depending on platform.
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      const px = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? delta * 16 : delta;
      e.preventDefault();
      panBy(px * msPerPx);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard: F toggles Follow, Esc unpins. Bound to the window this timeline is
  // rendered in, so a popped-out copy gets its own shortcuts.
  const keysRef = useRef({ toggleFollow: view.toggleFollow, unpin: view.unpin });
  useEffect(() => {
    keysRef.current = { toggleFollow: view.toggleFollow, unpin: view.unpin };
  }, [view.toggleFollow, view.unpin]);
  useEffect(() => {
    const win = rootRef.current?.ownerDocument.defaultView;
    if (!win) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      if (e.key === "Escape") keysRef.current.unpin();
      else if (e.key === "f" || e.key === "F") keysRef.current.toggleFollow();
    };
    win.addEventListener("keydown", onKey);
    return () => win.removeEventListener("keydown", onKey);
  }, []);
  const [hovered, setHovered] = useState<{ slot: number; cast: TimelineCast } | null>(null);
  const [hoveredSwing, setHoveredSwing] = useState<{ slot: number; swing: TimelineSwing } | null>(null);
  const [hoveredCluster, setHoveredCluster] = useState<{ slot: number; cluster: RailCluster } | null>(null);
  const panRef = useRef<{ x: number; startMs: number; endMs: number; moved: boolean } | null>(null);
  const { startMs: vs, endMs: ve, durationMs, isIgnored, nowMs } = view;
  const replaying = nowMs != null;
  const probeMs = view.indicatorMs;
  const span = Math.max(1, ve - vs);
  const P = (ms: number) => ((ms - vs) / span) * 100;
  const pxPerMs = trackWidth / span;

  const derived: DerivedPlayer[] = useMemo(
    () =>
      players.map((player, slot) => {
        const casts = playerCasts(player.data);
        const gaps = idleGaps(casts, gcd, idleThresholdMs);
        return {
          player,
          slot,
          casts,
          shownCasts: casts.filter((c) => !isIgnored(c.spellName)),
          ends: castEnds(casts, gcd),
          actions: casts.filter(
            (c) =>
              !isIgnored(c.spellName) &&
              castKind(c, gcd, cooldownInfo) !== "proc",
          ),
          offsetMs: alignOffsetMs(casts, view.align, isIgnored),
          gaps,
          busy: busySegments(casts, gcd, idleThresholdMs),
          stats: playerStats(player.data, casts, gaps, durationMs),
        };
      }),
    [players, gcd, idleThresholdMs, view.align, isIgnored, durationMs, cooldownInfo],
  );

  const overview = useMemo(() => {
    const healing = view.metric === "healing";
    const bins = Math.ceil(durationMs / DAMAGE_BIN_MS);
    return {
      series: players.map((p) => ({
        name: p.name,
        dps: dpsSeries(healing ? p.data.healBins : p.data.damageBins, bins),
        avgDps: durationMs > 0 ? (healing ? p.data.totalHealing : p.data.totalDamage) / (durationMs / 1000) : 0,
      })),
      lead:
        players.length === 2
          ? healing
            ? damageLead(players[0].data.healBins, players[1].data.healBins, bins)
            : damageLead(players[0].data.damageBins, players[1].data.damageBins, bins)
          : null,
    };
  }, [players, durationMs, view.metric]);

  const ticks = useMemo(() => {
    const step = tickStepMs(span);
    const out: number[] = [];
    for (let t = Math.ceil(vs / step) * step; t <= ve; t += step) out.push(t);
    return out;
  }, [vs, ve, span]);

  // Ignored spells by name, with an icon from any cast of that spell when one exists.
  const ignoredSpells = view.ignoredNames.map((name) => {
    const cast = derived.flatMap((d) => d.casts).find((c) => c.spellName.toLowerCase() === name.trim().toLowerCase());
    return { name, icon: spellMeta(cast?.spellId ?? null).icon };
  });
  const layout = laneLayout(pxPerMs, view.iconSize);

  // One color per cooldown spell, in order of first use, shared by both players.
  // How long a cast tints its lane: a buff's real duration when known (buff
  // overrides, consumables with a matching aura), a consumable's spell
  // duration, or the cooldown's duration. 0 for everything else, and for
  // cooldowns cast on another player (the caster never had the buff).
  const tintDurationMs = useCallback(
    (c: TimelineCast) => {
      if (c.onOtherPlayer) return 0;
      if (c.buffEndMs != null) return c.buffEndMs - c.startMs;
      if (c.consume) return Math.max(0, spellMeta(c.spellId).spell?.duration?.Duration ?? 0);
      return cooldownInfo(c.spellId)?.durationMs ?? 0;
    },
    [cooldownInfo, spellMeta],
  );

  // One color and strip row per tinting spell, in order of first use, shared by both players.
  const cooldownColor = useMemo(() => {
    const ids: number[] = [];
    const consumes = new Set<number>();
    for (const d of derived) {
      for (const c of d.shownCasts) {
        if (c.consume) consumes.add(c.spellId);
        if ((c.consume || cooldownInfo(c.spellId)) && !ids.includes(c.spellId)) ids.push(c.spellId);
      }
    }
    return (spellId: number) => {
      const i = Math.max(0, ids.indexOf(spellId));
      const color = consumes.has(spellId)
        ? CONSUME_COLOR
        : (cooldownInfo(spellId)?.color ?? COOLDOWN_COLORS[i % COOLDOWN_COLORS.length]);
      return { color, index: i };
    };
  }, [derived, cooldownInfo]);

  const trackMs = (e: PointerEvent) => {
    const rect = trackEl?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return vs + ((e.clientX - rect.left) / rect.width) * span;
  };

  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || view.windowLocked) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { x: e.clientX, startMs: vs, endMs: ve, moved: false };
  };
  const onTrackPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && trackWidth > 0) {
      if (Math.abs(e.clientX - pan.x) < CLICK_SLOP_PX && !pan.moved) return;
      pan.moved = true;
      const shift = -((e.clientX - pan.x) / trackWidth) * (pan.endMs - pan.startMs);
      view.setWindow(pan.startMs + shift, pan.endMs + shift);
      return;
    }
    view.setCursorMs(trackMs(e));
  };
  const endPan = () => {
    panRef.current = null;
  };
  const onTrackPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    panRef.current = null;
    if (!pan || pan.moved || trackWidth === 0) return;
    // A click without a drag pins the indicator.
    const ms = trackMs(e);
    if (ms != null) view.pinAt(ms, CLICK_SLOP_PX / pxPerMs);
  };

  // Tooltips render outside the card (it clips), so they need viewport coordinates.
  const anchorAt = (leftPct: number, laneTop: number, laneBottom: number): TooltipAnchor | null => {
    if (!trackEl) return null;
    const rect = trackEl.getBoundingClientRect();
    return {
      x: rect.left + (Math.min(100, Math.max(0, leftPct)) / 100) * rect.width,
      below: rect.top + laneBottom,
      above: rect.top + laneTop,
      win: trackEl.ownerDocument.defaultView ?? window,
    };
  };

  const castLaneTop = (index: number) =>
    derived.slice(0, index).reduce((sum, d) => sum + layout.height + (d.player.data.swings.length > 0 ? SWING_LANE_H : 0), 0);

  return (
    <div
      ref={rootRef}
      className="bg-card text-[13px] text-foreground"
      // Right-click unpins. The browser menu is only suppressed while something is pinned.
      onContextMenu={(e) => {
        if (view.pinnedMs == null) return;
        e.preventDefault();
        view.unpin();
      }}
    >
      {/* Title row: players and ignored spells (design: Rotations 9c). */}
      <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <div className="text-[15px] font-semibold">Rotation</div>
        {headerStart}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Ignored</span>
          {ignoredSpells.length === 0 && <span className="opacity-70">Ctrl+click a spell to hide it</span>}
          {ignoredSpells.map(({ name, icon }) => (
            <button
              key={name}
              type="button"
              title={`${name} (click to show)`}
              onClick={() => view.toggleIgnored(name)}
              className="size-5 rounded-[3px] border border-border bg-muted bg-cover bg-center opacity-60 grayscale hover:opacity-100 hover:grayscale-0"
              style={{ backgroundImage: `url(${icon})` }}
            />
          ))}
        </div>
        <KeybindsButton keybinds={[...TIMELINE_KEYBINDS, ...extraKeybinds]} />
      </div>

      {showOverview && <RotationOverview series={overview.series} lead={overview.lead} view={view} />}

      {/* View toolbar, directly above the time axis it controls (design: Rotations 9c). */}
      <div className="flex min-h-10 flex-wrap items-center gap-4 border-b border-border bg-background px-4 py-1.5">
        <Segmented label="Zoom" title="Visible time span">
          <SegButton onClick={() => view.zoom(1.5)} title="Zoom out" ariaLabel="Zoom out">
            <Minus className="size-3.5" />
          </SegButton>
          <span className="min-w-[38px] text-center font-mono text-[11px] text-foreground">{formatClock(span, 0)}</span>
          <SegButton onClick={() => view.zoom(1 / 1.5)} title="Zoom in" ariaLabel="Zoom in">
            <Plus className="size-3.5" />
          </SegButton>
          <span className="mx-0.5 h-4 w-px bg-border" />
          <SegButton onClick={view.fit} title="Show whole fight">
            Fit
          </SegButton>
        </Segmented>
        <div className="flex h-7 items-center rounded-[5px] border border-border bg-background p-0.5">
          <button
            type="button"
            onClick={view.toggleFollow}
            aria-pressed={view.follow}
            title="Follow cursor: the lanes stay centered on the overview cursor as you move it (F)"
            className={cn(
              "flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[3px] px-2 text-xs",
              view.follow ? "bg-school-holy/15 text-school-holy" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="flex size-[9px] items-center justify-center rounded-full border-[1.5px] border-current">
              <span className={cn("size-[3px] rounded-full", view.follow && "bg-school-holy")} />
            </span>
            Follow
          </button>
        </div>
        <span className="h-4 w-px bg-border" />
        <Segmented label="Align">
          <SegButton active={view.align === "pull"} disabled={replaying} onClick={() => view.setAlign("pull")}>
            Pull
          </SegButton>
          <SegButton
            active={view.align === "first_cast"}
            disabled={replaying}
            title={replaying ? "Replay follows pull time" : undefined}
            onClick={() => view.setAlign("first_cast")}
          >
            First cast
          </SegButton>
        </Segmented>
        <Segmented label="Icons" title="Icon size. Auto grows icons as you zoom in">
          <SegButton active={view.iconSize === "auto"} onClick={() => view.setIconSize("auto")} title="Auto">
            <span className="text-[10px] font-semibold tracking-wide">AUTO</span>
          </SegButton>
          {(["s", "m", "l"] as const).map((size, i) => (
            <SegButton key={size} active={view.iconSize === size} onClick={() => view.setIconSize(size)} title={size.toUpperCase()}>
              <IconGlyph size={[8, 11, 14][i]} />
            </SegButton>
          ))}
        </Segmented>
      </div>

      {/* Ruler */}
      <div className="grid h-6 border-b border-border" style={{ gridTemplateColumns: `${LABEL_WIDTH}px minmax(0,1fr)` }}>
        <div className="px-4 py-1 text-[11px] text-muted-foreground">
          {view.align === "pull" ? "Time since pull" : "Time since first cast"}
        </div>
        <div className="relative overflow-hidden border-l border-border">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-1 -translate-x-1/2 font-mono text-[10px] text-muted-foreground"
              style={{ left: `${P(t)}%` }}
            >
              {formatClock(t, 0)}
            </span>
          ))}
          {probeMs != null && P(probeMs) >= 0 && P(probeMs) <= 100 && (
            <span
              className="absolute top-0.5 z-10 -translate-x-1/2 rounded-sm bg-school-holy px-1 font-mono text-[10px] font-semibold text-background"
              style={{ left: `${P(probeMs)}%` }}
            >
              {view.pinnedMs != null && <Pin className="mr-0.5 inline size-2.5 align-[-1px]" />}
              {formatClock(probeMs)}
            </span>
          )}
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: `${LABEL_WIDTH}px minmax(0,1fr)` }}>
        {/* Labels */}
        <div className="text-[11px] text-muted-foreground">
          {derived.map((d) => {
            const near = probeMs != null ? nearbyActivity(d.actions, probeMs + d.offsetMs, gcd, d.gaps) : null;
            return (
              <div key={d.player.guid}>
                <div
                  className="flex flex-col justify-center gap-0.5 border-b border-border px-4"
                  style={{ height: layout.height }}
                >
                  <div className="flex items-center gap-2">
                    <SlotBadge slot={d.slot} />
                    <span
                      className="truncate text-[13px] font-semibold"
                      style={{ color: `var(--color-class-${d.player.className.toLowerCase()})` }}
                    >
                      {d.player.name}
                    </span>
                    <span className="flex-1" />
                    <span className="font-mono text-foreground">
                      {formatNumber(Math.round(view.metric === "healing" ? d.stats.hps : d.stats.dps))}
                    </span>
                  </div>
                  {/* Idle % normally; around the indicator: last action, idle or busy, next action (design: Rotations 2a). */}
                  {near ? (
                    <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap font-mono text-[10px]">
                      <span className="text-foreground">
                        ‹ {near.sinceLastMs != null ? `${(near.sinceLastMs / 1000).toFixed(1)}s ago` : "—"}
                      </span>
                      {near.idleMs > 50 ? (
                        <span className="font-semibold text-destructive">idle {(near.idleMs / 1000).toFixed(1)}s</span>
                      ) : (
                        near.sinceLastMs != null && (
                          <span className="text-muted-foreground" title="Casting or on the global cooldown">
                            busy
                          </span>
                        )
                      )}
                      <span className="ml-auto text-foreground">
                        {near.untilNextMs != null ? `next ${(near.untilNextMs / 1000).toFixed(1)}s` : "—"} ›
                      </span>
                    </div>
                  ) : (
                    <div className="font-mono text-[10px]">
                      <span title={`${formatClock(d.stats.idleMs)} idle in total`}>{d.stats.idlePct.toFixed(1)}% idle</span>
                    </div>
                  )}
                </div>
                {d.player.data.swings.length > 0 && (
                  <div
                    className="flex h-6 items-center border-b border-border pl-10 pr-4"
                    title={`${swingHandKnown ? "Top: main hand · bottom: off hand · " : ""}white: hit · yellow: crit · grey: glancing · red: miss · pink: dodge · dark red: parry`}
                  >
                    Auto attacks
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Tracks */}
        <div
          ref={trackRef}
          className="relative cursor-grab touch-none select-none border-l border-border active:cursor-grabbing"
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={endPan}
          onPointerLeave={() => {
            view.setCursorMs(null);
            setHovered(null);
            setHoveredSwing(null);
            setHoveredCluster(null);
          }}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {ticks.map((t) => (
              <div key={t} className="absolute inset-y-0 w-px bg-border/60" style={{ left: `${P(t)}%` }} />
            ))}
          </div>
          <div className="relative overflow-hidden">
            {derived.map((d) => (
              <PlayerLanes
                key={d.player.guid}
                derived={d}
                P={P}
                vs={vs}
                ve={ve}
                pxPerMs={pxPerMs}
                gcd={gcd}
                nowMs={nowMs}
                layout={layout}
                cooldownInfo={cooldownInfo}
                cooldownColor={cooldownColor}
                tintDurationMs={tintDurationMs}
                swingHandKnown={swingHandKnown}
                metric={view.metric}
                near={probeMs != null ? nearbyActivity(d.actions, probeMs + d.offsetMs, gcd, d.gaps) : null}
                hoveredCast={hovered?.slot === d.slot ? hovered.cast : null}
                probeMs={probeMs != null ? probeMs + d.offsetMs : null}
                spellMeta={spellMeta}
                onToggleIgnored={view.toggleIgnored}
                onHover={(cast) => setHovered(cast ? { slot: d.slot, cast } : null)}
                onHoverSwing={(swing) => setHoveredSwing(swing ? { slot: d.slot, swing } : null)}
                onHoverCluster={(cluster) => setHoveredCluster(cluster ? { slot: d.slot, cluster } : null)}
              />
            ))}
          </div>
          {probeMs != null && <IndicatorLine leftPct={P(probeMs)} />}
          {hoveredSwing && (
            <SwingTooltip
              swing={hoveredSwing.swing}
              anchor={anchorAt(
                P(hoveredSwing.swing.offsetMs - derived[hoveredSwing.slot].offsetMs),
                castLaneTop(hoveredSwing.slot) + layout.height,
                castLaneTop(hoveredSwing.slot) + layout.height + SWING_LANE_H,
              )}
              unitName={unitName}
              icon={spellMeta(AUTO_ATTACK_SPELL_ID).icon}
              handKnown={swingHandKnown}
            />
          )}
          {hoveredCluster && (
            <ClusterTooltip
              cluster={hoveredCluster.cluster}
              casts={derived[hoveredCluster.slot].shownCasts}
              anchor={anchorAt(
                P(hoveredCluster.cluster.startMs - derived[hoveredCluster.slot].offsetMs),
                castLaneTop(hoveredCluster.slot),
                castLaneTop(hoveredCluster.slot) + layout.height,
              )}
              spellMeta={spellMeta}
              cooldownColor={cooldownColor}
            />
          )}
          {hovered && (
            <CastTooltip
              cast={hovered.cast}
              anchor={anchorAt(
                P(
                  iconTimeMs(hovered.cast, derived[hovered.slot].ends.get(hovered.cast) ?? castEndMs(hovered.cast)) -
                    derived[hovered.slot].offsetMs,
                ),
                castLaneTop(hovered.slot),
                castLaneTop(hovered.slot) + layout.height,
              )}
              meta={spellMeta(hovered.cast.spellId)}
              endMs={derived[hovered.slot].ends.get(hovered.cast) ?? castEndMs(hovered.cast)}
              unitName={unitName}
              activeCooldowns={activeCooldownsAt(derived[hovered.slot].shownCasts, hovered.cast, tintDurationMs).map((a) => ({
                ...a,
                icon: spellMeta(a.cast.spellId).icon,
                color: cooldownColor(a.cast.spellId).color,
              }))}
            />
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

interface PlayerLanesProps {
  derived: DerivedPlayer;
  P: (ms: number) => number;
  vs: number;
  ve: number;
  pxPerMs: number;
  gcd: GcdLookup;
  /** Replay time; casts after it are dimmed. */
  nowMs: number | null;
  layout: LaneLayout;
  /** Which amount labels the casts: damage or healing. */
  metric: TimelineMetric;
  /** Last/next action around the indicator, in this player's raw time. */
  near: NearbyActivity | null;
  /** The cast under the pointer; its bar draws above the icons. */
  hoveredCast: TimelineCast | null;
  probeMs: number | null;
  cooldownInfo: (spellId: number) => CooldownInfo | null;
  cooldownColor: (spellId: number) => { color: string; index: number };
  /** How long a cast tints the lane (0 when it does not). */
  tintDurationMs: (cast: TimelineCast) => number;
  /** Split swings into main-hand (top) and off-hand (bottom) rows. */
  swingHandKnown: boolean;
  spellMeta: (spellId: number | null) => SpellMeta;
  onToggleIgnored: (spellName: string) => void;
  onHover: (cast: TimelineCast | null) => void;
  onHoverSwing: (swing: TimelineSwing | null) => void;
  /** Hovering a stack of several rail events; single events use onHover. */
  onHoverCluster: (cluster: RailCluster | null) => void;
}

/**
 * One player's cast lane and auto attacks (design: Rotations 8a). GCD casts
 * are icons sized to the zoom; procs (off-GCD casts) and cooldowns sit on the
 * busy/idle rail below them, and cooldowns tint the lane for their duration.
 */
function PlayerLanes({
  derived,
  P,
  vs,
  ve,
  pxPerMs,
  gcd,
  nowMs,
  layout,
  metric,
  near,
  hoveredCast,
  probeMs,
  cooldownInfo,
  cooldownColor,
  tintDurationMs,
  swingHandKnown,
  spellMeta,
  onToggleIgnored,
  onHover,
  onHoverSwing,
  onHoverCluster,
}: PlayerLanesProps) {
  const { shownCasts: casts, offsetMs, gaps, busy, slot, player } = derived;
  const margin = 2000;
  const visible = (startMs: number, endMs: number) => endMs - offsetMs >= vs - margin && startMs - offsetMs <= ve + margin;

  const kindOf = (c: TimelineCast) => castKind(c, gcd, cooldownInfo);
  // Cooldowns and consumables tint the lane for their duration.
  const tintedCasts = casts.filter((c) => {
    const kind = kindOf(c);
    return (kind === "cooldown" || kind === "consume") && visible(c.startMs, c.startMs + tintDurationMs(c));
  });
  const { ends } = derived;
  const gcdCasts = casts.filter(
    (c) => kindOf(c) === "gcd" && visible(c.startMs, castSlotEnd(c, gcd, ends)),
  );
  const swings = player.data.swings.filter((s) => visible(s.offsetMs, s.offsetMs));
  const { icon, proc, cooldown, railTop } = layout;

  // Procs and cooldowns share the rail; ones close together stack into clusters.
  const clusters = useMemo(() => {
    const events: RailEvent[] = casts.flatMap((c) => {
      const kind = castKind(c, gcd, cooldownInfo);
      if (kind === "gcd") return [];
      return [{ cast: c, kind: kind === "cooldown" ? "cd" : kind } as RailEvent];
    });
    return clusterRailEvents(events, pxPerMs, cooldown);
  }, [casts, cooldownInfo, gcd, pxPerMs, cooldown]);

  const opacityOf = (c: TimelineCast) => {
    if (c.failed) return 0.4;
    if (nowMs != null && c.startMs - offsetMs > nowMs) return 0.45;
    return undefined;
  };

  const onSpellClick = (e: React.MouseEvent, spellName: string) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    onToggleIgnored(spellName);
  };
  const hoverProps = (c: TimelineCast) => ({
    onClick: (e: React.MouseEvent) => onSpellClick(e, c.spellName),
    onPointerEnter: () => onHover(c),
    onPointerLeave: () => onHover(null),
  });
  const span = (startMs: number, endMs: number) => {
    const left = P(startMs - offsetMs);
    return { left, width: P(endMs - offsetMs) - left };
  };

  return (
    <>
      <div className="relative border-b border-border" style={{ height: layout.height }}>
        {/* Cooldown and consumable durations: lane tint plus a strip per spell along the top. */}
        {tintedCasts.map((c, i) => {
          const durationMs = tintDurationMs(c);
          if (durationMs <= 0) return null;
          const { color, index } = cooldownColor(c.spellId);
          const { left, width } = span(c.startMs, c.startMs + durationMs);
          return (
            <div key={`cdt-${c.startMs}-${i}`} className="pointer-events-none">
              <div
                className="absolute inset-y-0 border-l"
                style={{ left: `${left}%`, width: `${width}%`, borderColor: color, background: `color-mix(in oklab, ${color} 9%, transparent)` }}
              />
              <div className="absolute h-[3px]" style={{ left: `${left}%`, width: `${width}%`, top: index * 3, background: color }} />
            </div>
          );
        })}

        {/* Busy / idle rail. */}
        {busy
          .filter((b) => visible(b.startMs, b.endMs))
          .map((b) => {
            const { left, width } = span(b.startMs, b.endMs);
            return (
              <div
                key={`busy-${b.startMs}`}
                className="pointer-events-none absolute h-[3px] opacity-75"
                style={{ left: `${left}%`, width: `${width}%`, top: railTop, background: SLOT_COLORS[slot] }}
              />
            );
          })}
        {gaps
          .filter((g) => visible(g.startMs, g.endMs))
          .map((g) => {
            const { left, width } = span(g.startMs, g.endMs);
            const widthPx = (g.endMs - g.startMs) * pxPerMs;
            return (
              <div key={`idle-${g.startMs}`} className="pointer-events-none">
                <div
                  className="absolute border-t border-dashed border-destructive"
                  style={{ left: `${left}%`, width: `${width}%`, top: railTop + 1 }}
                />
                {/* Icons are centered on cast times, so leave room for half an icon on each side. */}
                {widthPx >= icon + IDLE_LABEL_MIN_PX && (
                  <span
                    className="absolute text-center font-mono text-[10px]"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      top: layout.iconTop + icon / 2 - 6,
                      color: "color-mix(in oklab, var(--destructive) 75%, var(--foreground))",
                    }}
                  >
                    {((g.endMs - g.startMs) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            );
          })}

        {/* Around the indicator: a bracket from the last action to the next, red while idle (design: Rotations 2a). */}
        {near && probeMs != null && (
          <div className="pointer-events-none absolute inset-0 z-[5]">
            {(near.lastMs != null || near.nextMs != null) && (
              <div
                className="absolute h-px bg-muted-foreground opacity-60"
                style={{
                  top: railTop + 1,
                  left: `${near.lastMs != null ? P(near.lastMs - offsetMs) : 0}%`,
                  width: `${(near.nextMs != null ? P(near.nextMs - offsetMs) : 100) - (near.lastMs != null ? P(near.lastMs - offsetMs) : 0)}%`,
                }}
              />
            )}
            {near.idleMs > 50 && near.busyUntilMs != null && (
              <div
                className="absolute h-[3px] bg-destructive"
                style={{
                  top: railTop,
                  left: `${P(near.busyUntilMs - offsetMs)}%`,
                  width: `${P(probeMs - offsetMs) - P(near.busyUntilMs - offsetMs)}%`,
                }}
              />
            )}
            {[near.lastMs, near.nextMs].map(
              (ms, i) =>
                ms != null && (
                  <div
                    key={i}
                    className="absolute -ml-px h-2.5 w-0.5 bg-foreground"
                    style={{ top: railTop - 4, left: `${P(ms - offsetMs)}%` }}
                  />
                ),
            )}
          </div>
        )}

        {/* GCD casts: every bar first, then every icon on top, so a bar never hides
            another cast's icon. The hovered cast's bar is raised above the icons. */}
        {!layout.compact &&
          gcdCasts.map((c, i) => {
            const endMs = ends.get(c) ?? castEndMs(c);
            if (endMs <= c.startMs) return null;
            const left = P(c.startMs - offsetMs);
            const focused = c === hoveredCast;
            return (
              <div
                key={`bar-${c.startMs}-${i}`}
                // Cast time leads into the icon (it lands at the end); a channel trails out of it, notched per tick.
                className={cn(
                  "pointer-events-none absolute h-1",
                  c.channel ? "rounded-r-sm" : "rounded-l-sm",
                  focused ? "z-[3] shadow-[0_0_0_1px_var(--background)]" : "z-0",
                )}
                style={{
                  left: `${left}%`,
                  width: `${P(endMs - offsetMs) - left}%`,
                  top: layout.iconTop + icon / 2 - 2,
                  background: `var(--color-school-${spellMeta(c.spellId).school})`,
                  opacity: opacityOf(c),
                }}
              >
                {c.channel &&
                  c.tickMs
                    .filter((t) => t > c.startMs && t <= endMs)
                    .map((t) => (
                      <span
                        key={t}
                        className="absolute -top-0.5 h-2 w-px bg-background"
                        style={{ left: `${((t - c.startMs) / (endMs - c.startMs)) * 100}%` }}
                      />
                    ))}
              </div>
            );
          })}
        {gcdCasts.map((c, i) => {
          const meta = spellMeta(c.spellId);
          const endMs = ends.get(c) ?? castEndMs(c);
          const iconLeft = P(iconTimeMs(c, endMs) - offsetMs);
          const amount = metric === "healing" ? c.healing : c.damage + c.periodicDamage;
          const crit = isCrit(c, metric);
          if (layout.compact) {
            return (
              <div
                key={`${c.startMs}-${i}`}
                className="absolute w-[3px] -translate-x-1/2 rounded-[1px]"
                style={{ left: `${iconLeft}%`, top: layout.iconTop, height: icon, background: `var(--color-school-${meta.school})`, opacity: opacityOf(c) }}
                {...hoverProps(c)}
              />
            );
          }
          return (
            <div key={`${c.startMs}-${i}`} style={{ opacity: opacityOf(c) }}>
              <div
                className="absolute z-[1] rounded-[3px] bg-muted bg-cover bg-center"
                style={{
                  left: `${iconLeft}%`,
                  top: layout.iconTop,
                  width: icon,
                  height: icon,
                  marginLeft: -icon / 2,
                  backgroundImage: `url(${meta.icon})`,
                  boxShadow: crit ? CRIT_RING : "0 0 0 1px rgba(0,0,0,0.6)",
                }}
                {...hoverProps(c)}
              />
              {amount > 0 && (
                <span
                  className={cn(
                    "pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-mono",
                    crit ? "text-school-holy" : metric === "healing" ? "text-school-nature" : "text-muted-foreground",
                  )}
                  style={{ left: `${iconLeft}%`, top: layout.labelTop, fontSize: layout.labelFont }}
                >
                  {formatNumber(amount)}
                </span>
              )}
            </div>
          );
        })}

        {/* Rail: procs (circles) and cooldowns (ringed squares), stacked when close. */}
        {clusters
          .filter((k) => visible(k.startMs, k.endMs))
          .map((k) => {
            const multi = k.events.length > 1;
            const step = Math.round(cooldown * 0.5);
            return (
              <div
                key={`rail-${k.startMs}`}
                className="absolute flex items-center"
                style={{ left: `${P(k.startMs - offsetMs)}%`, top: railTop + 1 - cooldown / 2, height: cooldown, marginLeft: -cooldown / 2 }}
                onPointerEnter={() => (multi ? onHoverCluster(k) : onHover(k.events[0].cast))}
                onPointerLeave={() => (multi ? onHoverCluster(null) : onHover(null))}
              >
                {k.events.slice(0, MAX_STACKED_ICONS).map((e, j) => {
                  const size = e.kind === "proc" ? proc : cooldown;
                  const ring =
                    e.kind === "cd" ? cooldownColor(e.cast.spellId).color : e.kind === "consume" ? CONSUME_COLOR : null;
                  return (
                    <span
                      key={`${e.cast.startMs}-${j}`}
                      className={cn("relative shrink-0 bg-muted bg-cover bg-center", e.kind === "proc" ? "rounded-full" : "rounded-[2px]")}
                      style={{
                        width: size,
                        height: size,
                        marginLeft: j === 0 ? 0 : -step,
                        zIndex: MAX_STACKED_ICONS - j,
                        backgroundImage: `url(${spellMeta(e.cast.spellId).icon})`,
                        boxShadow: ring
                          ? `0 0 0 1px var(--background), 0 0 0 2px ${ring}`
                          : isCrit(e.cast, metric)
                            ? CRIT_RING
                            : "0 0 0 1px var(--background)",
                        opacity: opacityOf(e.cast),
                      }}
                      onClick={(ev) => onSpellClick(ev, e.cast.spellName)}
                    />
                  );
                })}
              </div>
            );
          })}
      </div>
      {player.data.swings.length > 0 && (
        <div className="relative border-b border-border" style={{ height: SWING_LANE_H }}>
          {swings.map((s, i) => {
            const color = swingColor(s.hitType, s.amount);
            // A wider transparent hit area around the 2px tick makes it hoverable.
            return (
              <div
                key={i}
                className="absolute flex h-3 w-2 -translate-x-1/2 justify-center"
                style={{ left: `${P(s.offsetMs - offsetMs)}%`, top: !swingHandKnown ? 6 : s.offHand ? 11 : 1 }}
                onPointerEnter={() => onHoverSwing(s)}
                onPointerLeave={() => onHoverSwing(null)}
              >
                <div className="mt-0.5 h-2 w-[2px]" style={{ background: color }} />
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/** Where a cast's icon sits: where a cast-time spell landed, or where a channel or instant began. */
function iconTimeMs(cast: TimelineCast, endMs: number): number {
  return !cast.channel && endMs > cast.startMs ? endMs : cast.startMs;
}

/** Cooldowns (with a duration) active when a cast went off, excluding the cast itself. */
function activeCooldownsAt(
  casts: readonly TimelineCast[],
  at: TimelineCast,
  tintDurationMs: (cast: TimelineCast) => number,
): { cast: TimelineCast; leftMs: number }[] {
  const out: { cast: TimelineCast; leftMs: number }[] = [];
  for (const c of casts) {
    if (c === at || c.failed || c.startMs > at.startMs) continue;
    const durationMs = tintDurationMs(c);
    const endMs = c.startMs + durationMs;
    if (durationMs > 0 && endMs > at.startMs) out.push({ cast: c, leftMs: endMs - at.startMs });
  }
  return out;
}

export function Segmented({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      {label && <span className="text-[11px] text-muted-foreground">{label}</span>}
      <div title={title} className="flex h-7 items-center gap-0.5 rounded-[5px] border border-border bg-background p-0.5">
        {children}
      </div>
    </div>
  );
}

export function SegButton({
  active,
  disabled,
  title,
  ariaLabel,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-[22px] min-w-[22px] items-center justify-center whitespace-nowrap rounded-[3px] px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/** Square glyph for the S / M / L icon size buttons. */
function IconGlyph({ size }: { size: number }) {
  return <span className="block rounded-[2px] border-[1.5px] border-current" style={{ width: size, height: size }} />;
}

interface ClusterTooltipProps {
  cluster: RailCluster;
  /** The player's shown casts, for GCD casts that landed in the same window. */
  casts: readonly TimelineCast[];
  anchor: TooltipAnchor | null;
  spellMeta: (spellId: number | null) => SpellMeta;
  cooldownColor: (spellId: number) => { color: string; index: number };
}

export const CLUSTER_CAST_MARGIN_MS = 300;
/** Rows listed in the stack tooltip; the rest are summarized. */
const CLUSTER_MAX_ROWS = 12;

/**
 * Stacked rail events (design: Rotations 2a): a mini timeline with numbered
 * marks, then one row per event with its offset from the first.
 */
function ClusterTooltip({ cluster, casts, anchor, spellMeta, cooldownColor }: ClusterTooltipProps) {
  const railCasts = new Set(cluster.events.map((e) => e.cast));
  const gcdCasts = casts
    .filter(
      (c) =>
        !railCasts.has(c) &&
        c.startMs >= cluster.startMs - CLUSTER_CAST_MARGIN_MS &&
        c.startMs <= cluster.endMs + CLUSTER_CAST_MARGIN_MS,
    )
    .map((c) => ({ cast: c, kind: "cast" as const }));
  const all = [...cluster.events, ...gcdCasts].sort((a, b) => a.cast.startMs - b.cast.startMs);
  const first = all[0].cast.startMs;
  const last = all[all.length - 1].cast.startMs;
  const lo = first - 150;
  const hi = Math.max(last + 150, lo + 600);
  const kindInfo = (e: (typeof all)[number]) =>
    e.kind === "cd"
      ? { label: "Cooldown", color: cooldownColor(e.cast.spellId).color }
      : e.kind === "proc"
        ? { label: "Proc", color: "var(--color-school-holy)" }
        : e.kind === "consume"
          ? { label: "Consumable", color: CONSUME_COLOR }
          : { label: "Cast", color: "var(--muted-foreground)" };

  return (
    <TooltipShell anchor={anchor} width={300}>
      <div className="text-xs font-semibold">
        {all.length} events within {((last - first) / 1000).toFixed(2)}s
      </div>
      <div className="flex flex-col gap-0.5">
        <div className="relative h-[18px] rounded-sm border border-border bg-background">
          {all.map((e, i) => {
            const pos = ((e.cast.startMs - lo) / (hi - lo)) * 100;
            return (
              <span key={i}>
                <span className="absolute inset-y-0.5 -ml-px w-0.5" style={{ left: `${pos}%`, background: kindInfo(e).color }} />
                <span
                  className="absolute -top-px ml-[3px] font-mono text-[9px] leading-[18px] text-muted-foreground"
                  style={{ left: `${pos}%` }}
                >
                  {i + 1}
                </span>
              </span>
            );
          })}
        </div>
        <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>+0.00s</span>
          <span>+{((hi - lo) / 1000).toFixed(2)}s</span>
        </div>
      </div>
      <div className="flex flex-col">
        {all.slice(0, CLUSTER_MAX_ROWS).map((e, i) => {
          const kind = kindInfo(e);
          const damage = e.cast.damage + e.cast.periodicDamage;
          return (
            <div key={i} className="grid grid-cols-[14px_20px_minmax(0,1fr)_auto] items-center gap-1.5 border-t border-border py-1">
              <span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>
              <span
                className={cn("size-5 border border-border bg-muted bg-cover bg-center", e.kind === "proc" ? "rounded-full" : "rounded-[3px]")}
                style={{ backgroundImage: `url(${spellMeta(e.cast.spellId).icon})` }}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-foreground">{e.cast.spellName}</span>
                <span className="text-[10px]" style={{ color: kind.color }}>
                  {kind.label}
                  {damage > 0 && <span className="ml-1 font-mono text-foreground">{formatNumber(damage)} dmg</span>}
                  <span className="ml-1 font-mono text-muted-foreground">· {CAST_SOURCE_LABELS[e.cast.source]}</span>
                </span>
              </span>
              <span className="flex flex-col items-end font-mono text-[10px]">
                <span className="text-foreground">{i === 0 ? "first" : `+${((e.cast.startMs - first) / 1000).toFixed(2)}s`}</span>
                <span className="text-muted-foreground">{formatClock(e.cast.startMs, 2)}</span>
              </span>
            </div>
          );
        })}
        {all.length > CLUSTER_MAX_ROWS && (
          <div className="border-t border-border pt-1 text-[10px] text-muted-foreground">
            +{all.length - CLUSTER_MAX_ROWS} more
          </div>
        )}
      </div>
    </TooltipShell>
  );
}

interface CastTooltipProps {
  cast: TimelineCast;
  anchor: TooltipAnchor | null;
  meta: SpellMeta;
  /** When the cast or channel finished. */
  endMs: number;
  unitName: (guid: string) => string;
  activeCooldowns: { cast: TimelineCast; leftMs: number; icon: string; color: string }[];
}

function CastTooltip({ cast, anchor, meta, endMs, unitName, activeCooldowns }: CastTooltipProps) {
  const castMs = endMs - cast.startMs;
  const damage = cast.damage + cast.periodicDamage;
  return (
    <TooltipShell anchor={anchor} width={288}>
      <TooltipHeader
        icon={meta.icon}
        title={cast.spellName}
        failed={cast.failed}
        subtitle={
          cast.consume
            ? `${formatClock(cast.startMs)} · consumable${cast.consume.itemId ? ` · item #${cast.consume.itemId}` : ""}`
            : [
                formatClock(cast.startMs),
                castMs > 0 ? `${(castMs / 1000).toFixed(1)}s ${cast.channel ? "channel" : "cast"}` : "instant",
              ].join(" · ") + (cast.target ? ` → ${unitName(cast.target)}` : "")
        }
      />
      {damage > 0 && (
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-bold">{formatNumber(damage)}</span>
          {cast.crits > 0 && (
            <span className="text-[11px] font-bold text-school-holy">CRIT{cast.hits > 1 ? ` ×${cast.crits}` : ""}</span>
          )}
          {cast.hits > 1 && <span className="text-muted-foreground">{cast.hits} hits</span>}
        </div>
      )}
      {cast.periodicDamage > 0 && (
        <div className="-mt-1 text-muted-foreground">incl. {formatNumber(cast.periodicDamage)} periodic</div>
      )}
      {(cast.healing > 0 || cast.overheal > 0) && (
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="font-mono text-xl font-bold text-school-nature">+{formatNumber(cast.healing)}</span>
          {cast.healCrits > 0 && <span className="text-[11px] font-bold text-school-holy">CRIT</span>}
          {cast.overheal > 0 && (
            <span className="text-muted-foreground">
              overheal {formatNumber(cast.overheal)} ({Math.round((cast.overheal / (cast.healing + cast.overheal)) * 100)}%)
            </span>
          )}
        </div>
      )}
      {cast.itemId != null && <div className="text-muted-foreground">Item #{cast.itemId}</div>}
      <div className="font-mono text-[10px] text-muted-foreground">from {CAST_SOURCE_LABELS[cast.source]}</div>
      {activeCooldowns.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border pt-2">
          {activeCooldowns.map((a) => (
            <div key={`${a.cast.spellId}-${a.cast.startMs}`} className="flex items-center gap-2">
              <span
                className="size-4 shrink-0 rounded-[2px] bg-muted bg-cover bg-center"
                style={{ backgroundImage: `url(${a.icon})`, boxShadow: `0 0 0 1px var(--background), 0 0 0 2px ${a.color}` }}
              />
              <span className="min-w-0 flex-1 truncate text-foreground">{a.cast.spellName}</span>
              <span className="font-mono text-muted-foreground">{(a.leftMs / 1000).toFixed(0)}s left</span>
            </div>
          ))}
        </div>
      )}
    </TooltipShell>
  );
}

interface SwingTooltipProps {
  swing: TimelineSwing;
  anchor: TooltipAnchor | null;
  unitName: (guid: string) => string;
  icon: string;
  /** False when the log does not say which hand swung. */
  handKnown: boolean;
}

function SwingTooltip({ swing, anchor, unitName, icon, handKnown }: SwingTooltipProps) {
  const outcome = hitTypeNames(swing.hitType).filter((n) => n !== "Off-Hand" && n !== "Hit");
  return (
    <TooltipShell anchor={anchor} width={240}>
      <TooltipHeader
        icon={icon}
        title={!handKnown ? "Auto attack" : swing.offHand ? "Off hand" : "Main hand"}
        subtitle={formatClock(swing.offsetMs) + (swing.target ? ` → ${unitName(swing.target)}` : "")}
      />
      <div className="flex items-baseline gap-2">
        <span className={cn("font-mono text-2xl font-bold", swing.amount === 0 && "text-destructive")}>
          {swing.amount > 0 ? formatNumber(swing.amount) : "0"}
        </span>
        {outcome.length > 0 && (
          <span className="text-[11px] font-bold uppercase" style={{ color: swingColor(swing.hitType, swing.amount) }}>
            {outcome.join(" · ")}
          </span>
        )}
      </div>
      {swing.tailerAmount > 0 && (
        <div className="-mt-1 text-muted-foreground">incl. {formatNumber(swing.tailerAmount)} from procs</div>
      )}
    </TooltipShell>
  );
}
