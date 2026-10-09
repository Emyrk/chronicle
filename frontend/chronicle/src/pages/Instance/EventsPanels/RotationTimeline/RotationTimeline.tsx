import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { hitTypeNames } from "@/lib/hittype/hittype";
import { cn } from "@/lib/utils";
import {
  alignOffsetMs,
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
  DAMAGE_BIN_MS,
  type PlayerTimelineData,
  type TimelineCast,
  type TimelineSwing,
} from "./rotationTimeline.processor";
import { IndicatorLine } from "./IndicatorLine";
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
  /** Casts of these spells go to the cooldown lane instead of the cast lane. */
  isCooldown: (spellId: number) => boolean;
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
  stats: PlayerStats;
}

const LABEL_WIDTH = 220;
const CAST_LANE_H = 56;
const SWING_LANE_H = 24;
const CD_LANE_H = 28;

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
  isCooldown,
  unitName,
  headerStart,
  showOverview = true,
  idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS,
  children,
}: RotationTimelineProps) {
  const [trackRef, trackWidth] = useElementWidth<HTMLDivElement>();
  const [hovered, setHovered] = useState<{ slot: number; cast: TimelineCast } | null>(null);
  const [hoveredSwing, setHoveredSwing] = useState<{ slot: number; swing: TimelineSwing } | null>(null);
  const panRef = useRef<{ x: number; startMs: number; endMs: number } | null>(null);
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
          stats: playerStats(player.data, casts, gaps, durationMs),
        };
      }),
    [players, gcd, idleThresholdMs, view.align, ignored, durationMs],
  );

  const overview = useMemo(() => {
    const bins = Math.ceil(durationMs / DAMAGE_BIN_MS);
    return {
      series: players.map((p) => ({ name: p.name, dps: dpsSeries(p.data.damageBins, bins) })),
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

  const trackMs = (e: PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    return vs + ((e.clientX - rect.left) / rect.width) * span;
  };

  const onTrackPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.ctrlKey || e.metaKey || replaying) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { x: e.clientX, startMs: vs, endMs: ve };
  };
  const onTrackPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && trackWidth > 0) {
      const shift = -((e.clientX - pan.x) / trackWidth) * (pan.endMs - pan.startMs);
      view.setWindow(pan.startMs + shift, pan.endMs + shift);
      return;
    }
    view.setCursorMs(trackMs(e));
  };
  const endPan = () => {
    panRef.current = null;
  };

  const castLaneTop = (index: number) =>
    derived.slice(0, index).reduce((sum, d) => sum + CAST_LANE_H + (d.player.data.swings.length > 0 ? SWING_LANE_H : 0) + CD_LANE_H, 0);

  return (
    <div className="bg-card text-[13px] text-foreground">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
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
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-0.5 rounded border border-border bg-background p-0.5">
          <span className="px-1.5 text-[11px] text-muted-foreground">Align</span>
          <Button
            variant={view.align === "pull" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            disabled={replaying}
            onClick={() => view.setAlign("pull")}
          >
            Pull
          </Button>
          <Button
            variant={view.align === "first_cast" ? "secondary" : "ghost"}
            size="sm"
            className="h-7"
            disabled={replaying}
            title={replaying ? "Replay follows pull time" : undefined}
            onClick={() => view.setAlign("first_cast")}
          >
            First cast
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => view.zoom(1.5)} aria-label="Zoom out">
            <Minus />
          </Button>
          <span className="min-w-12 text-center font-mono text-[11px] text-muted-foreground">{formatClock(span, 0)}</span>
          <Button variant="outline" size="icon-sm" onClick={() => view.zoom(1 / 1.5)} aria-label="Zoom in">
            <Plus />
          </Button>
          <Button variant="ghost" size="sm" onClick={view.fit}>
            Fit
          </Button>
        </div>
      </div>

      {showOverview && <RotationOverview series={overview.series} lead={overview.lead} view={view} />}

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
                <div className="flex h-14 flex-col justify-center gap-0.5 border-b border-border px-4">
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
                <div className="flex h-7 items-center border-b border-border pl-10 pr-4">Cooldowns</div>
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
          onPointerUp={endPan}
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
                isCooldown={isCooldown}
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
              top={castLaneTop(hoveredSwing.slot) + CAST_LANE_H + SWING_LANE_H - 2}
              unitName={unitName}
            />
          )}
          {hovered && (
            <CastTooltip
              cast={hovered.cast}
              derived={derived[hovered.slot]}
              left={P(hovered.cast.startMs - derived[hovered.slot].offsetMs)}
              top={castLaneTop(hovered.slot) + CAST_LANE_H - 6}
              meta={spellMeta(hovered.cast.spellId)}
              unitName={unitName}
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
  isCooldown: (spellId: number) => boolean;
  spellMeta: (spellId: number | null) => SpellMeta;
  onToggleIgnored: (spellId: number) => void;
  onHover: (cast: TimelineCast | null) => void;
  onHoverSwing: (swing: TimelineSwing | null) => void;
}

function PlayerLanes({ derived, P, vs, ve, pxPerMs, gcd, ignored, nowMs, isCooldown, spellMeta, onToggleIgnored, onHover, onHoverSwing }: PlayerLanesProps) {
  const { casts, offsetMs, gaps, slot, player } = derived;
  const margin = 2000;
  const visible = (startMs: number, endMs: number) => endMs - offsetMs >= vs - margin && startMs - offsetMs <= ve + margin;

  const laneCasts = casts.filter((c) => !isCooldown(c.spellId) && visible(c.startMs, castSlotEnd(c, gcd)));
  const cdCasts = casts.filter((c) => isCooldown(c.spellId) && visible(c.startMs, c.startMs));
  const swings = player.data.swings.filter((s) => visible(s.offsetMs, s.offsetMs));

  const opacityOf = (spellId: number, startMs: number) => {
    if (ignored.has(spellId)) return 0.15;
    if (nowMs != null && startMs - offsetMs > nowMs) return 0.45;
    return undefined;
  };

  const onSpellClick = (e: React.MouseEvent, spellId: number) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    e.stopPropagation();
    onToggleIgnored(spellId);
  };

  return (
    <>
      <div className="relative border-b border-border" style={{ height: CAST_LANE_H }}>
        {gaps
          .filter((g) => visible(g.startMs, g.endMs))
          .map((g) => {
            const left = P(g.startMs - offsetMs);
            const width = P(g.endMs - offsetMs) - left;
            return (
              <div
                key={g.startMs}
                className="pointer-events-none absolute inset-y-0"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background:
                    "repeating-linear-gradient(135deg, color-mix(in oklab, var(--destructive) 30%, transparent) 0 3px, transparent 3px 7px)",
                }}
              >
                {(g.endMs - g.startMs) * pxPerMs > 34 && (
                  <span className="absolute bottom-0.5 left-1 font-mono text-[9px] text-destructive">
                    {((g.endMs - g.startMs) / 1000).toFixed(1)}s
                  </span>
                )}
              </div>
            );
          })}
        {laneCasts.map((c, i) => {
          const meta = spellMeta(c.spellId);
          const slotEnd = castSlotEnd(c, gcd);
          const left = P(c.startMs - offsetMs);
          const width = P(slotEnd - offsetMs) - left;
          const castDuration = Math.max(c.endMs - c.startMs, c.channelTimeMs ?? 0);
          const widthPx = (slotEnd - c.startMs) * pxPerMs;
          const compact = widthPx < 14;
          const damage = c.damage + c.periodicDamage;
          return (
            <div
              key={`${c.startMs}-${i}`}
              className={cn("absolute inset-y-0", c.failed && "opacity-40")}
              style={{ left: `${left}%`, width: `${width}%`, opacity: opacityOf(c.spellId, c.startMs) }}
              onClick={(e) => onSpellClick(e, c.spellId)}
              onPointerEnter={() => onHover(c)}
              onPointerLeave={() => onHover(null)}
            >
              <div
                className="absolute bottom-1 left-0 h-[3px] rounded-[1px]"
                style={{
                  width: castDuration > 0 ? `${Math.min(100, (castDuration / (slotEnd - c.startMs)) * 100)}%` : "12%",
                  background: `var(--color-school-${meta.school})`,
                }}
              />
              {compact ? (
                <div
                  className="absolute left-0 top-2 h-5 w-[3px] rounded-[1px]"
                  style={{ background: `var(--color-school-${meta.school})` }}
                />
              ) : (
                <div
                  className="absolute left-px top-[7px] size-[22px] rounded-[3px] border border-border bg-muted bg-cover bg-center"
                  style={{ backgroundImage: `url(${meta.icon})` }}
                />
              )}
              {!compact && widthPx > 24 && damage > 0 && (
                <div
                  className={cn("absolute left-0 top-8 whitespace-nowrap font-mono text-[9px]", c.crits > 0 ? "text-school-holy" : "text-muted-foreground")}
                >
                  {formatNumber(damage)}
                </div>
              )}
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
                style={{ left: `${P(s.offsetMs - offsetMs)}%`, top: s.offHand ? 11 : 1 }}
                onPointerEnter={() => onHoverSwing(s)}
                onPointerLeave={() => onHoverSwing(null)}
              >
                <div
                  className="mt-0.5 h-2 w-[2px]"
                  style={{ background: color }}
                />
              </div>
            );
          })}
        </div>
      )}
      <div className="relative border-b border-border" style={{ height: CD_LANE_H }}>
        {cdCasts.map((c, i) => {
          const meta = spellMeta(c.spellId);
          return (
            <div
              key={`${c.startMs}-${i}`}
              title={c.spellName}
              className="absolute top-1 size-[18px] rounded-[3px] border bg-muted bg-cover bg-center"
              style={{
                left: `${P(c.startMs - offsetMs)}%`,
                borderColor: SLOT_COLORS[slot],
                backgroundImage: `url(${meta.icon})`,
                opacity: opacityOf(c.spellId, c.startMs),
              }}
              onClick={(e) => onSpellClick(e, c.spellId)}
              onPointerEnter={() => onHover(c)}
              onPointerLeave={() => onHover(null)}
            />
          );
        })}
      </div>
    </>
  );
}

interface CastTooltipProps {
  cast: TimelineCast;
  derived: DerivedPlayer;
  left: number;
  top: number;
  meta: SpellMeta;
  unitName: (guid: string) => string;
}

function CastTooltip({ cast, derived, left, top, meta, unitName }: CastTooltipProps) {
  const buffs = derived.player.data.aurasOn
    .filter((a) => a.isBuff && a.startMs <= cast.startMs && (a.endMs == null || a.endMs > cast.startMs))
    .map((a) => a.spellName);
  const castMs = Math.max(cast.endMs - cast.startMs, cast.channelTimeMs ?? 0);
  return (
    <div
      className="pointer-events-none absolute z-20 flex w-64 -translate-x-1/2 flex-col gap-1.5 rounded border border-border bg-popover p-2.5 text-[11px] shadow-lg"
      style={{ left: `${Math.min(88, Math.max(12, left))}%`, top }}
    >
      <div className="flex items-center gap-2">
        <span
          className="size-[30px] shrink-0 rounded-[3px] border border-border bg-muted bg-cover bg-center"
          style={{ backgroundImage: `url(${meta.icon})` }}
        />
        <div className="flex min-w-0 flex-col">
          <span className="font-wow truncate text-sm" style={{ color: `var(--color-school-${meta.school})` }}>
            {cast.spellName}
            {cast.failed && <span className="ml-1 text-destructive">(failed)</span>}
          </span>
          <span className="font-mono text-muted-foreground">
            {formatClock(cast.startMs)} · {castMs > 0 ? `${(castMs / 1000).toFixed(1)}s cast` : "instant"} · #{cast.spellId}
          </span>
        </div>
      </div>
      {(cast.damage > 0 || cast.periodicDamage > 0) && (
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[15px] font-semibold">{formatNumber(cast.damage + cast.periodicDamage)}</span>
          {cast.crits > 0 && <span className="text-[10px] font-bold text-school-holy">CRIT{cast.hits > 1 ? ` ×${cast.crits}` : ""}</span>}
          {cast.hits > 1 && <span className="text-muted-foreground">{cast.hits} hits</span>}
          {cast.periodicDamage > 0 && (
            <span className="text-muted-foreground">({formatNumber(cast.periodicDamage)} periodic)</span>
          )}
        </div>
      )}
      {cast.target && (
        <div className="text-muted-foreground">
          Target <span className="text-foreground">{unitName(cast.target)}</span>
        </div>
      )}
      {buffs.length > 0 && (
        <div className="text-muted-foreground">
          Buffs <span className="text-foreground">{buffs.slice(0, 8).join(", ")}{buffs.length > 8 ? ` +${buffs.length - 8}` : ""}</span>
        </div>
      )}
      {cast.itemId != null && <div className="text-muted-foreground">Item #{cast.itemId}</div>}
    </div>
  );
}

interface SwingTooltipProps {
  swing: TimelineSwing;
  left: number;
  top: number;
  unitName: (guid: string) => string;
}

function SwingTooltip({ swing, left, top, unitName }: SwingTooltipProps) {
  const outcome = hitTypeNames(swing.hitType).filter((n) => n !== "Off-Hand" && n !== "Hit");
  return (
    <div
      className="pointer-events-none absolute z-20 flex w-52 -translate-x-1/2 flex-col gap-1 rounded border border-border bg-popover p-2.5 text-[11px] shadow-lg"
      style={{ left: `${Math.min(90, Math.max(10, left))}%`, top }}
    >
      <div className="flex justify-between text-muted-foreground">
        <span className="text-foreground">{swing.offHand ? "Off hand" : "Main hand"}</span>
        <span className="font-mono">{formatClock(swing.offsetMs)}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("font-mono text-[15px] font-semibold", swing.amount === 0 && "text-destructive")}>
          {swing.amount > 0 ? formatNumber(swing.amount) : "0"}
        </span>
        {outcome.length > 0 && (
          <span className="text-[10px] font-bold uppercase" style={{ color: swingColor(swing.hitType, swing.amount) }}>
            {outcome.join(" · ")}
          </span>
        )}
      </div>
      {swing.tailerAmount > 0 && (
        <div className="text-muted-foreground">
          incl. <span className="font-mono text-foreground">{formatNumber(swing.tailerAmount)}</span> from procs
        </div>
      )}
      {swing.target && (
        <div className="text-muted-foreground">
          Target <span className="text-foreground">{unitName(swing.target)}</span>
        </div>
      )}
    </div>
  );
}
