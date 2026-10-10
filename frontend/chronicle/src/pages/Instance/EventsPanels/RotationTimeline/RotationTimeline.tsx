import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Minus, Pin, Plus } from "lucide-react";
import { formatNumber } from "@/lib/format";
import { hitTypeNames } from "@/lib/hittype/hittype";
import { cn } from "@/lib/utils";
import {
  alignOffsetMs,
  busySegments,
  castAt,
  castSlotEnd,
  damageLead,
  dpsSeries,
  idleGaps,
  playerCasts,
  playerStats,
  DEFAULT_IDLE_THRESHOLD_MS,
  type IdleGap,
  type PlayerStats,
} from "./derive";
import { formatClock, SLOT_COLORS, SLOT_LABELS, swingColor, tickStepMs } from "./format";
import {
  AUTO_ATTACK_SPELL_ID,
  DAMAGE_BIN_MS,
  type PlayerTimelineData,
  type TimelineCast,
  type TimelineSwing,
} from "./rotationTimeline.processor";
import { IndicatorLine } from "./IndicatorLine";
import { COOLDOWN_COLORS, laneLayout, type LaneLayout } from "./laneLayout";
import { RotationOverview } from "./RotationOverview";
import type { SpellMeta } from "./useSpellMeta";
import type { RotationView } from "./useRotationView";
import type { GcdLookup } from "./derive";

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
  cooldownInfo: (spellId: number) => { durationMs: number } | null;
  unitName: (guid: string) => string;
  /** Rendered after the title, e.g. player pickers. */
  headerStart?: ReactNode;
  showOverview?: boolean;
  idleThresholdMs?: number;
  /** Rendered under the lanes, e.g. the page's aura section. */
  children?: ReactNode;
}

interface DerivedPlayer {
  player: RotationTimelinePlayer;
  slot: number;
  casts: TimelineCast[];
  offsetMs: number;
  gaps: IdleGap[];
  busy: IdleGap[];
  stats: PlayerStats;
}

const LABEL_WIDTH = 220;
/** Pointer movement under this many px is a click, not a drag. */
const CLICK_SLOP_PX = 4;
const SWING_LANE_H = 24;
/** Idle gaps get a duration label once they are this wide. */
const IDLE_LABEL_MIN_PX = 30;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

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
  children,
}: RotationTimelineProps) {
  const [trackRef, trackWidth] = useElementWidth<HTMLDivElement>();
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
  const [hovered, setHovered] = useState<{ slot: number; cast: TimelineCast } | null>(null);
  const [hoveredSwing, setHoveredSwing] = useState<{ slot: number; swing: TimelineSwing } | null>(null);
  const panRef = useRef<{ x: number; startMs: number; endMs: number; moved: boolean } | null>(null);
  const { startMs: vs, endMs: ve, durationMs, ignored, nowMs } = view;
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
          offsetMs: alignOffsetMs(casts, view.align, ignored),
          gaps,
          busy: busySegments(casts, gcd, idleThresholdMs),
          stats: playerStats(player.data, casts, gaps, durationMs),
        };
      }),
    [players, gcd, idleThresholdMs, view.align, ignored, durationMs],
  );

  const overview = useMemo(() => {
    const bins = Math.ceil(durationMs / DAMAGE_BIN_MS);
    return {
      series: players.map((p) => ({
        name: p.name,
        dps: dpsSeries(p.data.damageBins, bins),
        avgDps: durationMs > 0 ? p.data.totalDamage / (durationMs / 1000) : 0,
      })),
      lead: players.length === 2 ? damageLead(players[0].data.damageBins, players[1].data.damageBins, bins) : null,
    };
  }, [players, durationMs]);

  const ticks = useMemo(() => {
    const step = tickStepMs(span);
    const out: number[] = [];
    for (let t = Math.ceil(vs / step) * step; t <= ve; t += step) out.push(t);
    return out;
  }, [vs, ve, span]);

  const ignoredSpells = Array.from(ignored);
  const layout = laneLayout(pxPerMs, view.iconSize);

  // One color per cooldown spell, in order of first use, shared by both players.
  const cooldownColor = useMemo(() => {
    const ids: number[] = [];
    for (const d of derived) {
      for (const c of d.casts) if (cooldownInfo(c.spellId) && !ids.includes(c.spellId)) ids.push(c.spellId);
    }
    return (spellId: number) => {
      const i = ids.indexOf(spellId);
      return { color: COOLDOWN_COLORS[Math.max(0, i) % COOLDOWN_COLORS.length], index: Math.max(0, i) };
    };
  }, [derived, cooldownInfo]);

  const trackMs = (e: PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return vs + ((e.clientX - rect.left) / rect.width) * span;
  };

  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || view.windowLocked) return;
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

  const castLaneTop = (index: number) =>
    derived.slice(0, index).reduce((sum, d) => sum + layout.height + (d.player.data.swings.length > 0 ? SWING_LANE_H : 0), 0);

  return (
    <div ref={rootRef} className="bg-card text-[13px] text-foreground">
      {/* Title row: players and ignored spells (design: Rotations 9c). */}
      <div className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <div className="text-[15px] font-semibold">Rotation</div>
        {headerStart}
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>Ignored</span>
          {ignoredSpells.length === 0 && <span className="opacity-70">Ctrl+click a spell to hide it</span>}
          {ignoredSpells.map((id) => {
            const meta = spellMeta(id);
            return (
              <button
                key={id}
                type="button"
                title={`${meta.spell?.name ?? id} (click to show)`}
                onClick={() => view.toggleIgnored(id)}
                className="size-5 rounded-[3px] border border-border bg-muted bg-cover bg-center opacity-60 grayscale hover:opacity-100 hover:grayscale-0"
                style={{ backgroundImage: `url(${meta.icon})` }}
              />
            );
          })}
        </div>
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
        </Segmented>
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
            const atCursor = probeMs != null ? castAt(d.casts, probeMs + d.offsetMs, gcd) : null;
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
                    <span className="font-mono text-foreground">{formatNumber(Math.round(d.stats.dps))}</span>
                  </div>
                  <div className="flex gap-2.5 font-mono text-[10px]">
                    <span>{d.stats.casts} casts</span>
                    <span title={`${formatClock(d.stats.idleMs)} idle`}>{d.stats.idlePct.toFixed(1)}% idle</span>
                    {probeMs != null && (
                      <span className="truncate text-school-holy">→ {atCursor ? atCursor.spellName : "idle"}</span>
                    )}
                  </div>
                </div>
                {d.player.data.swings.length > 0 && (
                  <div
                    className="flex h-6 items-center border-b border-border pl-10 pr-4"
                    title="Top: main hand · bottom: off hand · white: hit · yellow: crit · grey: glancing · red: miss · pink: dodge · dark red: parry"
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
                ignored={ignored}
                nowMs={nowMs}
                layout={layout}
                cooldownInfo={cooldownInfo}
                cooldownColor={cooldownColor}
                spellMeta={spellMeta}
                onToggleIgnored={view.toggleIgnored}
                onHover={(cast) => setHovered(cast ? { slot: d.slot, cast } : null)}
                onHoverSwing={(swing) => setHoveredSwing(swing ? { slot: d.slot, swing } : null)}
              />
            ))}
          </div>
          {probeMs != null && <IndicatorLine leftPct={P(probeMs)} />}
          {hoveredSwing && (
            <SwingTooltip
              swing={hoveredSwing.swing}
              left={P(hoveredSwing.swing.offsetMs - derived[hoveredSwing.slot].offsetMs)}
              top={castLaneTop(hoveredSwing.slot) + layout.height + SWING_LANE_H - 2}
              unitName={unitName}
              icon={spellMeta(AUTO_ATTACK_SPELL_ID).icon}
            />
          )}
          {hovered && (
            <CastTooltip
              cast={hovered.cast}
              left={P(hovered.cast.startMs - derived[hovered.slot].offsetMs)}
              top={castLaneTop(hovered.slot) + layout.height - 4}
              meta={spellMeta(hovered.cast.spellId)}
              unitName={unitName}
              activeCooldowns={activeCooldownsAt(derived[hovered.slot].casts, hovered.cast, cooldownInfo).map((a) => ({
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
  ignored: ReadonlySet<number>;
  /** Replay time; casts after it are dimmed. */
  nowMs: number | null;
  layout: LaneLayout;
  cooldownInfo: (spellId: number) => { durationMs: number } | null;
  cooldownColor: (spellId: number) => { color: string; index: number };
  spellMeta: (spellId: number | null) => SpellMeta;
  onToggleIgnored: (spellId: number) => void;
  onHover: (cast: TimelineCast | null) => void;
  onHoverSwing: (swing: TimelineSwing | null) => void;
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
  ignored,
  nowMs,
  layout,
  cooldownInfo,
  cooldownColor,
  spellMeta,
  onToggleIgnored,
  onHover,
  onHoverSwing,
}: PlayerLanesProps) {
  const { casts, offsetMs, gaps, busy, slot, player } = derived;
  const margin = 2000;
  const visible = (startMs: number, endMs: number) => endMs - offsetMs >= vs - margin && startMs - offsetMs <= ve + margin;

  const isOffGcd = (c: TimelineCast) => gcd(c.spellId) === 0 && c.endMs === c.startMs && !c.channelTimeMs;
  const cooldownCasts = casts.filter((c) => {
    const info = cooldownInfo(c.spellId);
    return info != null && visible(c.startMs, c.startMs + info.durationMs);
  });
  const others = casts.filter((c) => !cooldownInfo(c.spellId) && visible(c.startMs, castSlotEnd(c, gcd)));
  const gcdCasts = others.filter((c) => !isOffGcd(c));
  const procs = others.filter(isOffGcd);
  const swings = player.data.swings.filter((s) => visible(s.offsetMs, s.offsetMs));
  const { icon, proc, cooldown, railTop } = layout;

  const opacityOf = (c: TimelineCast) => {
    if (ignored.has(c.spellId)) return 0.15;
    if (c.failed) return 0.4;
    if (nowMs != null && c.startMs - offsetMs > nowMs) return 0.45;
    return undefined;
  };

  const onSpellClick = (e: React.MouseEvent, spellId: number) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    onToggleIgnored(spellId);
  };
  const hoverProps = (c: TimelineCast) => ({
    onClick: (e: React.MouseEvent) => onSpellClick(e, c.spellId),
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
        {/* Cooldown durations: lane tint plus a strip per cooldown along the top. */}
        {cooldownCasts.map((c, i) => {
          const durationMs = cooldownInfo(c.spellId)?.durationMs ?? 0;
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

        {/* GCD casts. */}
        {gcdCasts.map((c, i) => {
          const meta = spellMeta(c.spellId);
          const left = P(c.startMs - offsetMs);
          const damage = c.damage + c.periodicDamage;
          if (layout.compact) {
            return (
              <div
                key={`${c.startMs}-${i}`}
                className="absolute w-[3px] -translate-x-1/2 rounded-[1px]"
                style={{ left: `${left}%`, top: layout.iconTop, height: icon, background: `var(--color-school-${meta.school})`, opacity: opacityOf(c) }}
                {...hoverProps(c)}
              />
            );
          }
          return (
            <div key={`${c.startMs}-${i}`} style={{ opacity: opacityOf(c) }}>
              <div
                className="absolute rounded-[3px] bg-muted bg-cover bg-center shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
                style={{ left: `${left}%`, top: layout.iconTop, width: icon, height: icon, marginLeft: -icon / 2, backgroundImage: `url(${meta.icon})` }}
                {...hoverProps(c)}
              />
              {damage > 0 && (
                <span
                  className={cn("pointer-events-none absolute -translate-x-1/2 whitespace-nowrap font-mono", c.crits > 0 ? "text-school-holy" : "text-muted-foreground")}
                  style={{ left: `${left}%`, top: layout.labelTop, fontSize: layout.labelFont }}
                >
                  {formatNumber(damage)}
                </span>
              )}
              {layout.showNames && (
                <span
                  className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[10px] text-muted-foreground"
                  style={{ left: `${left}%`, top: layout.nameTop }}
                >
                  {c.spellName}
                </span>
              )}
            </div>
          );
        })}

        {/* Procs: off-GCD casts as circles on the rail. */}
        {procs.map((c, i) => (
          <div
            key={`proc-${c.startMs}-${i}`}
            className="absolute rounded-full bg-muted bg-cover bg-center shadow-[0_0_0_1px_var(--background)]"
            style={{
              left: `${P(c.startMs - offsetMs)}%`,
              top: railTop + 1 - proc / 2,
              width: proc,
              height: proc,
              marginLeft: -proc / 2,
              backgroundImage: `url(${spellMeta(c.spellId).icon})`,
              opacity: opacityOf(c),
            }}
            {...hoverProps(c)}
          />
        ))}

        {/* Cooldowns: squares with their color ring on the rail. */}
        {cooldownCasts.map((c, i) => {
          const { color } = cooldownColor(c.spellId);
          return (
            <div
              key={`cd-${c.startMs}-${i}`}
              className="absolute rounded-[2px] bg-muted bg-cover bg-center"
              style={{
                left: `${P(c.startMs - offsetMs)}%`,
                top: railTop + 1 - cooldown / 2,
                width: cooldown,
                height: cooldown,
                marginLeft: -cooldown / 2,
                backgroundImage: `url(${spellMeta(c.spellId).icon})`,
                boxShadow: `0 0 0 1px var(--background), 0 0 0 2px ${color}`,
                opacity: opacityOf(c),
              }}
              {...hoverProps(c)}
            />
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
                style={{ left: `${P(s.offsetMs - offsetMs)}%`, top: s.offHand ? 11 : 1 }}
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

/** Cooldowns (with a duration) active when a cast went off, excluding the cast itself. */
function activeCooldownsAt(
  casts: readonly TimelineCast[],
  at: TimelineCast,
  cooldownInfo: (spellId: number) => { durationMs: number } | null,
): { cast: TimelineCast; leftMs: number }[] {
  const out: { cast: TimelineCast; leftMs: number }[] = [];
  for (const c of casts) {
    if (c === at || c.failed || c.startMs > at.startMs) continue;
    const durationMs = cooldownInfo(c.spellId)?.durationMs ?? 0;
    const endMs = c.startMs + durationMs;
    if (durationMs > 0 && endMs > at.startMs) out.push({ cast: c, leftMs: endMs - at.startMs });
  }
  return out;
}

function Segmented({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div title={title} className="flex h-7 items-center gap-0.5 rounded-[5px] border border-border bg-background p-0.5">
        {children}
      </div>
    </div>
  );
}

function SegButton({
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

interface CastTooltipProps {
  cast: TimelineCast;
  left: number;
  top: number;
  meta: SpellMeta;
  unitName: (guid: string) => string;
  activeCooldowns: { cast: TimelineCast; leftMs: number; icon: string; color: string }[];
}

function CastTooltip({ cast, left, top, meta, unitName, activeCooldowns }: CastTooltipProps) {
  const castMs = Math.max(cast.endMs - cast.startMs, cast.channelTimeMs ?? 0);
  const damage = cast.damage + cast.periodicDamage;
  return (
    <TooltipShell left={left} top={top} width="w-72">
      <TooltipHeader
        icon={meta.icon}
        title={cast.spellName}
        failed={cast.failed}
        subtitle={[
          formatClock(cast.startMs),
          castMs > 0 ? `${(castMs / 1000).toFixed(1)}s cast` : "instant",
        ].join(" · ") + (cast.target ? ` → ${unitName(cast.target)}` : "")}
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
      {cast.itemId != null && <div className="text-muted-foreground">Item #{cast.itemId}</div>}
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

/** Shared frame for the lane tooltips. */
function TooltipShell({ left, top, width, children }: { left: number; top: number; width: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 flex -translate-x-1/2 flex-col gap-2 rounded-md border border-border bg-popover p-3 text-[11px] shadow-xl",
        width,
      )}
      style={{ left: `${Math.min(88, Math.max(12, left))}%`, top }}
    >
      {children}
    </div>
  );
}

function TooltipHeader({ icon, title, subtitle, failed }: { icon: string; title: string; subtitle: string; failed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="size-9 shrink-0 rounded-[4px] border border-border bg-muted bg-cover bg-center"
        style={{ backgroundImage: `url(${icon})` }}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-base font-medium leading-tight text-foreground">
          {title}
          {failed && <span className="ml-1.5 text-xs text-destructive">failed</span>}
        </span>
        <span className="truncate font-mono text-[11px] text-muted-foreground">{subtitle}</span>
      </div>
    </div>
  );
}

interface SwingTooltipProps {
  swing: TimelineSwing;
  left: number;
  top: number;
  unitName: (guid: string) => string;
  icon: string;
}

function SwingTooltip({ swing, left, top, unitName, icon }: SwingTooltipProps) {
  const outcome = hitTypeNames(swing.hitType).filter((n) => n !== "Off-Hand" && n !== "Hit");
  return (
    <TooltipShell left={left} top={top} width="w-60">
      <TooltipHeader
        icon={icon}
        title={swing.offHand ? "Off hand" : "Main hand"}
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
