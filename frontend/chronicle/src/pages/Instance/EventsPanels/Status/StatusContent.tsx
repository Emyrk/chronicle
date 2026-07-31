import { useCallback, useMemo, useState } from "react";
import { Activity, Crown, Heart, Minus, Plus, Shield, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { RelativeHealthBar } from "@/components/ui/RelativeHealthBar/RelativeHealthBar";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import {
  IncomingEventsBreakout,
  type IncomingEventDisplay,
  type IncomingEventsWindow,
} from "../IncomingEvents/IncomingEventsBreakout";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { usePlayerLifeState } from "../usePlayerLifeState";
import { useInferredRoles } from "../Roles/useInferredRoles";
import type { StatusResult, StatusTimelineEvent, StatusUnitKind } from "./status.processor";
import { parseStatusFocuses, STATUS_FOCUS_PREFIX, updateStatusFocuses } from "./statusFocus";
import { sortStatusEnemySnapshots, statusEnemyRowOpacity } from "./statusEnemies";
import {
  createStatusRaidHealthModel,
  statusRaidHealthAt,
  statusRaidHealthTimeline,
  type StatusRaidHealthModel,
} from "./statusRaidHealth";
import { sortStatusSnapshotsByRole } from "./statusRoles";
import {
  STATUS_WAVEFORM_COLORS,
  statusWaveformBarHeight,
  statusWaveformBarOpacity,
  statusWaveformBarWidth,
  statusWaveformEvents,
  statusWaveformPosition,
  statusWaveformScale,
  statusWaveformScaleSummary,
  type StatusWaveformEvent,
  type StatusWaveformScale,
} from "./statusWaveform";
import {
  selectStatusEncounter,
  snapshotStatusUnit,
  statusCursorMilli,
  statusLifeStateSpans,
  statusUnitRelativeHealthBounds,
  type StatusLifeTransition,
  type StatusUnitSnapshot,
} from "./statusTimeline";
import { STATUS_BREAKOUT_DEFAULT_WINDOW } from "./statusBreakoutWindow";
import {
  STATUS_WINDOW_PRESETS,
  parseStatusWindow,
  updateStatusWindow,
  type StatusWindowPreset,
  type StatusWindowPresetId,
} from "./statusWindow";

type StatusUnitMode = "players" | "enemies";

const UNIT_MODE_PREFIX = "u:";
const HIDE_DEAD_TOKEN = "hide-dead";
const UNIT_MODES: { value: StatusUnitMode; label: string }[] = [
  { value: "players", label: "Players" },
  { value: "enemies", label: "Enemies" },
];

function parseUnitMode(option: string | null | undefined): StatusUnitMode {
  const token = option?.split(",").find((value) => value.startsWith(UNIT_MODE_PREFIX));
  const value = token?.slice(UNIT_MODE_PREFIX.length);
  // Preserve old shared URLs that used separate boss/add modes.
  return value === "enemies" || value === "bosses" || value === "adds" ? "enemies" : "players";
}

function parseHideDead(option: string | null | undefined): boolean {
  return option?.split(",").includes(HIDE_DEAD_TOKEN) ?? false;
}

function updateHideDead(option: string | null | undefined, hideDead: boolean): string | null {
  const tokens = option?.split(",").filter((value) => value && value !== HIDE_DEAD_TOKEN) ?? [];
  if (hideDead) tokens.push(HIDE_DEAD_TOKEN);
  return tokens.length > 0 ? tokens.join(",") : null;
}

function updateUnitMode(option: string | null | undefined, mode: StatusUnitMode): string | null {
  const tokens = option?.split(",").filter((value) =>
    value && !value.startsWith(UNIT_MODE_PREFIX) && !value.startsWith(STATUS_FOCUS_PREFIX)
  ) ?? [];
  if (mode !== "players") tokens.push(`${UNIT_MODE_PREFIX}${mode}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}


function classColor(className: string, kind: StatusUnitKind): string {
  if (kind === "unit") return "var(--color-destructive)";
  if (!className || className === "UNKNOWN") return "var(--color-muted-foreground)";
  return `var(--color-class-${className.toLowerCase()})`;
}

function kindLabel(kind: StatusUnitKind): string {
  if (kind === "player") return "Player";
  if (kind === "pet") return "Pet";
  return "Unit";
}

function formatDelta(value: number): string {
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value))}`;
}

type StatusDensity = 0 | 1 | 2;

const ROW_CLASSES: Record<StatusDensity, string> = {
  0: "min-h-7 px-5 py-0.5",
  1: "min-h-9 px-6 py-1.5",
  2: "min-h-11 px-6 py-2.5",
};

const NAME_CLASSES: Record<StatusDensity, string> = {
  0: "text-xs",
  1: "text-sm",
  2: "text-sm",
};

interface StatusWaveformRow {
  events: StatusWaveformEvent[];
  lifeTransitions: StatusLifeTransition[];
  scale: StatusWaveformScale;
}

function ActivityLane({
  waveform,
  cursorMilli,
  windowPreset,
}: {
  waveform: StatusWaveformRow;
  cursorMilli: number;
  windowPreset: StatusWindowPreset;
}) {
  const laneWindowMilli = windowPreset.historyMilli + windowPreset.futureMilli;
  const startMilli = cursorMilli - windowPreset.historyMilli;
  const endMilli = cursorMilli + windowPreset.futureMilli;
  const playheadPercent = windowPreset.historyMilli / laneWindowMilli * 100;
  const barWidth = statusWaveformBarWidth(windowPreset.historyMilli, windowPreset.futureMilli);
  const { events, lifeTransitions, scale } = waveform;
  const lifeStateSpans = statusLifeStateSpans(lifeTransitions, startMilli, endMilli);
  const visibleTransitions = lifeTransitions.filter(
    (transition) => transition.timestampMilli >= startMilli && transition.timestampMilli <= endMilli,
  );

  return (
    <div className="relative h-[22px] overflow-hidden rounded-[1px] bg-[rgba(255,255,255,0.022)]">
      {lifeStateSpans.map((span, index) => {
        const left = statusWaveformPosition(span.startMilli, startMilli, laneWindowMilli);
        const right = statusWaveformPosition(span.endMilli, startMilli, laneWindowMilli);
        return (
          <span
            key={`${span.state}:${span.startMilli}:${index}`}
            className={cn(
              "pointer-events-none absolute inset-y-0",
              span.state === "dead" ? "z-10 bg-black/75" : "z-[1] bg-emerald-400/[0.09]",
            )}
            style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%` }}
          />
        );
      })}
      <div className="absolute inset-x-0 top-1/2 z-[2] h-px bg-white/[0.11]" />
      <div
        className="absolute inset-y-0 z-30 w-px bg-amber-200/70"
        style={{ left: `${playheadPercent}%` }}
      />
      {events.map((event) => {
        const height = statusWaveformBarHeight(event.amount, scale.rowMedian, scale.rowMax);
        const isDamage = event.kind === "damage";
        return (
          <span
            key={`${event.eventIndex}:${event.timestampMilli}:${event.kind}`}
            className="absolute rounded-[1px]"
            style={{
              left: `${statusWaveformPosition(event.timestampMilli, startMilli, laneWindowMilli)}%`,
              width: `${barWidth}px`,
              top: isDamage ? "50%" : undefined,
              bottom: isDamage ? undefined : "50%",
              height: `${height}px`,
              backgroundColor: STATUS_WAVEFORM_COLORS[event.kind],
              opacity: statusWaveformBarOpacity(
                event.amount,
                scale.highMagnitudeThreshold,
                event.timestampMilli,
                cursorMilli,
                windowPreset.historyMilli,
              ),
            }}
          />
        );
      })}
      {visibleTransitions.map((transition) => (
        <span
          key={`${transition.eventIndex}:${transition.timestampMilli}:${transition.alive ? "revived" : "death"}`}
          className={cn(
            "absolute inset-y-px z-20 w-0.5 rounded-[1px] opacity-95",
            transition.alive
              ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.55)]"
              : "bg-[#d4423f] shadow-[0_0_4px_rgba(212,66,63,0.45)]",
          )}
          style={{
            left: `${statusWaveformPosition(transition.timestampMilli, startMilli, laneWindowMilli)}%`,
          }}
          title={transition.alive ? "Revived" : "Died"}
        />
      ))}
    </div>
  );
}

function RelativeChange({ snapshot, density }: { snapshot: StatusUnitSnapshot; density: StatusDensity }) {
  return (
    <div className="relative">
      <RelativeHealthBar
        messages={snapshot.relativeHealthMessages}
        state={snapshot.relativeHealthState}
        bounds={snapshot.relativeHealthBounds}
        zeroPercent={68}
        className={cn("[&>div:last-child]:hidden", density === 0 ? "[&>div:first-child]:h-4" : density === 1 ? "[&>div:first-child]:h-5" : "[&>div:first-child]:h-6")}
      />
      {snapshot.dead ? (
        <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center gap-1 text-[9px] text-red-300">
          <Skull className="h-3 w-3" /> dead
        </span>
      ) : null}
      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center font-mono text-[9px] text-foreground/80">
        {formatDelta(snapshot.netChange)}
      </span>
    </div>
  );
}

interface FloatingStatusBreakout {
  unitId: string;
  initialPosition: { x: number; y: number };
}

function toIncomingEvent(event: StatusTimelineEvent): IncomingEventDisplay | null {
  if (event.kind !== "damage" && event.kind !== "heal" && event.kind !== "absorbed") return null;
  return {
    offsetMilli: event.offsetMilli,
    eventIndex: event.eventIndex,
    type: event.kind,
    amount: event.amount,
    overheal: event.overheal,
    sourceName: event.label,
    casterName: event.sourceName,
    spellId: event.spellId,
    absorbSpellName: event.kind === "absorbed" ? event.label : undefined,
    absorbSpellId: event.kind === "absorbed" ? event.spellId : undefined,
  };
}

function raidHealthColor(percent: number): string {
  if (percent < 25) return "bg-red-500/75";
  if (percent < 55) return "bg-amber-500/55";
  return "bg-emerald-500/50";
}

function RaidHealthSummary({
  model,
  startMilli,
  endMilli,
  cursorMilli,
}: {
  model: StatusRaidHealthModel;
  startMilli: number;
  endMilli: number;
  cursorMilli: number;
}) {
  const buckets = useMemo(
    () => statusRaidHealthTimeline(model, startMilli, endMilli, 96),
    [endMilli, model, startMilli],
  );
  const current = statusRaidHealthAt(model, cursorMilli);
  const duration = Math.max(1, endMilli - startMilli);
  const cursorPercent = Math.max(0, Math.min(100, (cursorMilli - startMilli) / duration * 100));

  return (
    <section
      className="grid grid-cols-[minmax(155px,0.7fr)_minmax(190px,0.85fr)_minmax(320px,1.8fr)] items-center gap-3 border-b border-border/40 bg-black/10 px-5 py-2"
      aria-label="Estimated raid durability timeline"
      title="Estimated from relative deficits and deaths. Players are assumed to begin at full health; deaths count as zero."
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Estimated raid durability
        </span>
        <span className="text-[9px] text-muted-foreground/70">
          {current.alive}/{current.total} active · encounter estimate
        </span>
      </div>
      <div className="relative col-span-2 h-11 overflow-hidden border border-white/[0.07] bg-[#111316] px-1.5 pb-1 pt-1.5">
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.06]" />
        <div className="relative flex h-full items-end gap-px">
          {buckets.map((bucket, index) => {
            const isFuture = bucket.startMilli > cursorMilli;
            return (
              <span
                key={`${bucket.startMilli}:${index}`}
                className={cn(
                  "min-w-0 flex-1 rounded-t-[1px] transition-[height,opacity]",
                  raidHealthColor(bucket.percent),
                  isFuture && "opacity-25",
                )}
                style={{ height: `${Math.max(2, bucket.percent)}%` }}
                title="Estimated raid durability"
              />
            );
          })}
        </div>
        <div
          className="pointer-events-none absolute inset-y-0 z-10 w-px bg-white/80 shadow-[0_0_5px_rgba(255,255,255,.55)]"
          style={{ left: `${cursorPercent}%` }}
        />
      </div>
    </section>
  );
}

export function StatusContent(props: PanelRenderProps<StatusResult>) {
  const { result, context, panelOption, setPanelOption } = props;
  const sync = useSyncModeContextOptional();
  const playerLife = usePlayerLifeState(context);
  const { roles } = useInferredRoles(context);
  const encounter = useMemo(
    () => selectStatusEncounter(result.encounters, context.selectedEncounterIds, sync?.currentTimestamp?.getTime() ?? null),
    [result.encounters, context.selectedEncounterIds, sync?.currentTimestamp],
  );
  const cursorMilli = encounter
    ? statusCursorMilli(encounter, sync?.currentTimestamp ?? null, sync?.enabled ?? false)
    : null;
  const unitMode = parseUnitMode(panelOption);
  const hideDead = parseHideDead(panelOption);
  const windowPreset = parseStatusWindow(panelOption);
  const enemyGroups = useMemo(() => {
    const selectedEncounter = encounter
      ? context.instance.encounters.find((candidate) => candidate.id === encounter.encounterId)
      : null;
    const bosses = new Set<string>();
    const enemies = new Set<string>();
    for (const enemy of selectedEncounter?.enemies ?? []) {
      enemies.add(enemy.id);
      if (enemy.boss) bosses.add(enemy.id);
    }
    return { bosses, enemies };
  }, [context.instance.encounters, encounter]);
  const lifeTransitionsByPlayer = useMemo(() => {
    if (!encounter || playerLife.loading || playerLife.error) return undefined;
    return new Map(Object.keys(context.instance.players ?? {}).map((playerId) => [
      playerId,
      playerLife.state.transitions(encounter.encounterId, playerId),
    ]));
  }, [context.instance.players, encounter, playerLife.error, playerLife.loading, playerLife.state]);
  const raidHealthModel = useMemo(() => createStatusRaidHealthModel(
    encounter
      ? Array.from(encounter.units.values()).filter((unit) => unit.kind === "player")
      : [],
    lifeTransitionsByPlayer,
  ), [encounter, lifeTransitionsByPlayer]);
  const matchingUnits = useMemo(() => {
    if (!encounter) return [];
    return Array.from(encounter.units.values()).filter((unit) =>
      unitMode === "players"
        ? unit.kind === "player"
        : enemyGroups.enemies.has(unit.unitId),
    );
  }, [encounter, enemyGroups, unitMode]);
  const relativeHealthBounds = useMemo(
    () => new Map(matchingUnits.map((unit) => [
      unit.unitId,
      statusUnitRelativeHealthBounds(unit, lifeTransitionsByPlayer?.get(unit.unitId)),
    ])),
    [lifeTransitionsByPlayer, matchingUnits],
  );
  const snapshots = useMemo(() => {
    if (cursorMilli === null) return [];
    const matchingSnapshots = matchingUnits.map((unit) => snapshotStatusUnit(
      unit,
      cursorMilli,
      windowPreset.historyMilli,
      windowPreset.futureMilli,
      relativeHealthBounds.get(unit.unitId),
      lifeTransitionsByPlayer?.get(unit.unitId),
    ));
    return unitMode === "players"
      ? sortStatusSnapshotsByRole(matchingSnapshots, roles)
      : sortStatusEnemySnapshots(matchingSnapshots, enemyGroups.bosses);
  }, [cursorMilli, enemyGroups.bosses, lifeTransitionsByPlayer, matchingUnits, relativeHealthBounds, roles, unitMode, windowPreset]);
  const displayRows = useMemo(() => {
    if (cursorMilli === null) return [];
    return snapshots.flatMap((snapshot) => {
      const opacity = unitMode === "enemies"
        ? statusEnemyRowOpacity(snapshot.deadSinceMilli, cursorMilli, hideDead)
        : 1;
      return opacity === null ? [] : [{ snapshot, opacity }];
    });
  }, [cursorMilli, hideDead, snapshots, unitMode]);
  const { waveformRows, waveformScaleStats } = useMemo(() => {
    const rows = new Map<string, StatusWaveformRow>();
    for (const { snapshot } of displayRows) {
      const activity = [...snapshot.recentActivity, ...snapshot.incoming];
      const events = statusWaveformEvents(activity);
      const sharedLifeTransitions = lifeTransitionsByPlayer?.get(snapshot.unit.unitId);
      rows.set(snapshot.unit.unitId, {
        events,
        lifeTransitions: sharedLifeTransitions?.map((transition) => ({
          timestampMilli: transition.timestampMilli,
          eventIndex: transition.eventIndex,
          alive: transition.alive,
        })) ?? activity
          .filter((event) => event.kind === "death")
          .map((event) => ({
            timestampMilli: event.timestampMilli,
            eventIndex: event.eventIndex,
            alive: false,
          })),
        scale: statusWaveformScale(events),
      });
    }
    return {
      waveformRows: rows,
      waveformScaleStats: statusWaveformScaleSummary(
        Array.from(rows.values(), (row) => row.scale.rowMax),
      ),
    };
  }, [displayRows, lifeTransitionsByPlayer]);
  const [floatingBreakouts, setFloatingBreakouts] = useState<Map<string, FloatingStatusBreakout>>(() => new Map());
  const focusedUnitIds = useMemo(() => {
    const focused = parseStatusFocuses(panelOption);
    for (const unitId of floatingBreakouts.keys()) focused.add(unitId);
    return focused;
  }, [floatingBreakouts, panelOption]);
  const [density, setDensity] = useState<StatusDensity>(0);
  const [breakoutWindow, setBreakoutWindow] = useState<IncomingEventsWindow>(STATUS_BREAKOUT_DEFAULT_WINDOW);
  const [sharedFightOffsetMilli, setSharedFightOffsetMilli] = useState<number | null>(null);

  const selectUnit = useCallback((unitId: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const cascadeOffset = floatingBreakouts.size * 18;
    const x = Math.max(8, Math.min(rect.right + 8 + cascadeOffset, window.innerWidth - 640));
    const y = Math.max(8, Math.min(rect.top + cascadeOffset, window.innerHeight - 520));
    const next = new Map(floatingBreakouts);
    const existing = next.get(unitId);
    next.delete(unitId);
    next.set(unitId, existing ?? { unitId, initialPosition: { x, y } });
    setFloatingBreakouts(next);
    setPanelOption?.(updateStatusFocuses(panelOption, next.keys()));
  }, [floatingBreakouts, panelOption, setPanelOption]);

  const closeBreakout = useCallback((unitId: string) => {
    const next = new Map(floatingBreakouts);
    next.delete(unitId);
    setFloatingBreakouts(next);
    if (next.size === 0) setSharedFightOffsetMilli(null);
    setPanelOption?.(updateStatusFocuses(panelOption, next.keys()));
  }, [floatingBreakouts, panelOption, setPanelOption]);

  const selectUnitMode = useCallback((mode: StatusUnitMode) => {
    setFloatingBreakouts(new Map());
    setSharedFightOffsetMilli(null);
    setPanelOption?.(updateUnitMode(panelOption, mode));
  }, [panelOption, setPanelOption]);

  const toggleHideDead = useCallback(() => {
    setPanelOption?.(updateHideDead(panelOption, !hideDead));
  }, [hideDead, panelOption, setPanelOption]);

  const selectWindowPreset = useCallback((presetId: StatusWindowPresetId) => {
    setPanelOption?.(updateStatusWindow(panelOption, presetId));
  }, [panelOption, setPanelOption]);

  return (
    <>
    <GenericPanel {...props}>
      <div
        role="tablist"
        aria-label="Status units"
        className="flex items-center gap-1 border-b border-border/40 px-5 py-1.5"
      >
        {UNIT_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            role="tab"
            aria-selected={unitMode === mode.value}
            onClick={() => selectUnitMode(mode.value)}
            className={cn(
              "rounded-t border-b-2 px-2.5 py-1 text-[10px] font-medium transition-colors",
              unitMode === mode.value
                ? "border-primary bg-muted/70 text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {mode.label}
          </button>
        ))}
        {unitMode === "enemies" ? (
          <button
            type="button"
            onClick={toggleHideDead}
            aria-pressed={hideDead}
            className={cn(
              "ml-auto flex items-center gap-1.5 rounded border px-2 py-1 text-[10px] font-medium transition-colors",
              hideDead
                ? "border-red-400/35 bg-red-500/10 text-red-200"
                : "border-border/60 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span className={cn(
              "h-2 w-2 rounded-[2px] border",
              hideDead ? "border-red-300 bg-red-400" : "border-muted-foreground/60",
            )} />
            Hide dead
          </button>
        ) : null}
      </div>
      {encounter && cursorMilli !== null && raidHealthModel.unitCount > 0 ? (
        <RaidHealthSummary
          model={raidHealthModel}
          startMilli={encounter.startMilli}
          endMilli={encounter.endMilli}
          cursorMilli={cursorMilli}
        />
      ) : null}
      <div className="grid grid-cols-[minmax(155px,0.7fr)_minmax(190px,0.85fr)_minmax(320px,1.8fr)] items-center gap-3 border-b border-border/40 px-5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Unit</span>
        <span>Relative health change</span>
        <span className="flex items-center gap-2">
          <select
            value={windowPreset.id}
            onChange={(event) => selectWindowPreset(event.target.value as StatusWindowPresetId)}
            className="h-5 rounded border border-border/60 bg-background px-1.5 text-[9px] font-medium normal-case tracking-normal text-muted-foreground outline-none transition-colors hover:text-foreground focus:border-ring"
            aria-label="Status timeline window"
            title="Timeline history and future window"
          >
            {STATUS_WINDOW_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
          <span className="ml-auto h-4 w-px bg-border/60" />
          <button
            type="button"
            onClick={() => setDensity((value) => Math.max(0, value - 1) as StatusDensity)}
            disabled={density === 0}
            className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            title="Show more units"
            aria-label="Decrease Status row size"
          >
            <Minus className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => setDensity((value) => Math.min(2, value + 1) as StatusDensity)}
            disabled={density === 2}
            className="flex h-5 w-5 items-center justify-center rounded border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            title="Show larger rows"
            aria-label="Increase Status row size"
          >
            <Plus className="h-3 w-3" />
          </button>
        </span>
      </div>
      {displayRows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
          <Activity className="h-5 w-5 opacity-50" />
          <span>
            {unitMode === "enemies" && hideDead && snapshots.length > 0
              ? "No living enemies remain."
              : `No ${UNIT_MODES.find((mode) => mode.value === unitMode)?.label.toLowerCase()} matched this panel.`}
          </span>
          <span className="text-[10px]">Try another unit group or adjust the panel filters.</span>
        </div>
      ) : (
        <div className="styled-scrollbar min-h-0 flex-1 overflow-auto">
          {displayRows.map(({ snapshot, opacity }) => {
            const unit = snapshot.unit;
            const waveform = waveformRows.get(unit.unitId)!;
            const role = unit.kind === "player" ? roles.get(unit.unitId)?.role : undefined;
            const ownerName = unit.ownerId ? context.instance.players?.[unit.ownerId]?.name : null;
            return (
              <button
                key={unit.unitId}
                type="button"
                onClick={(event) => selectUnit(unit.unitId, event.currentTarget)}
                className={cn(
                  "grid w-full grid-cols-[minmax(155px,0.7fr)_minmax(190px,0.85fr)_minmax(320px,1.8fr)] items-center gap-3 border-b border-border/25 text-left transition-[background-color,opacity] hover:bg-muted/20",
                  ROW_CLASSES[density],
                  snapshot.dead && "bg-black/35 hover:bg-black/30",
                  focusedUnitIds.has(unit.unitId) && "ring-1 ring-inset ring-amber-300/30",
                  focusedUnitIds.has(unit.unitId) && !snapshot.dead && "bg-amber-400/5",
                )}
                style={{ opacity }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {unitMode === "enemies" && enemyGroups.bosses.has(unit.unitId) ? (
                    <Crown className="h-3.5 w-3.5 shrink-0 fill-red-500/25 text-red-400" aria-label="Boss" />
                  ) : role === "tank" ? (
                    <Shield className="h-3 w-3 shrink-0 text-amber-500" aria-label="Tank" />
                  ) : role === "healer" ? (
                    <Heart className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Healer" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: classColor(unit.className, unit.kind) }} />
                  )}
                  <span
                    className={cn(
                      "truncate font-semibold transition-opacity",
                      NAME_CLASSES[density],
                      snapshot.dead && "line-through opacity-50",
                    )}
                    style={{ color: classColor(unit.className, unit.kind) }}
                  >
                    {unit.name}
                  </span>
                  {unit.kind !== "player" ? (
                    <span className="truncate text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {unitMode === "enemies"
                        ? (enemyGroups.bosses.has(unit.unitId) ? "Boss" : "Enemy")
                        : kindLabel(unit.kind)}{ownerName ? ` · ${ownerName}` : ""}
                    </span>
                  ) : null}
                </span>
                <RelativeChange snapshot={snapshot} density={density} />
                <ActivityLane
                  waveform={waveform}
                  cursorMilli={cursorMilli!}
                  windowPreset={windowPreset}
                />
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-border/40 px-3 py-1 text-[9px] text-muted-foreground">
        <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500" />damage taken</span>
        <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />healing taken</span>
        <span><i className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-sky-400" />absorbed</span>
        <span className="flex items-center gap-1 text-red-300"><Skull className="h-2.5 w-2.5" />death</span>
        {waveformScaleStats ? (
          <span
            className="ml-auto font-mono text-[8px] text-muted-foreground/80"
            title="Distribution of the largest visible health event in each populated row"
          >
            row scale min {formatNumber(waveformScaleStats.min)} · median {formatNumber(waveformScaleStats.median)} · max {formatNumber(waveformScaleStats.max)}
          </span>
        ) : <span className="ml-auto" />}
        <span>{windowPreset.label}</span>
      </div>
    </GenericPanel>
    {encounter && cursorMilli !== null ? Array.from(floatingBreakouts.entries()).map(([
      unitId,
      floatingBreakout,
    ]) => {
      const breakoutUnit = encounter.units.get(unitId);
      if (!breakoutUnit) return null;
      const breakoutEvents = breakoutUnit.events
        .map(toIncomingEvent)
        .filter((event): event is IncomingEventDisplay => event !== null);
      return (
        <FloatingIncomingEventsBreakout
          key={unitId}
          initialPosition={floatingBreakout.initialPosition}
          onClose={() => closeBreakout(unitId)}
        >
          <IncomingEventsBreakout
            unitName={breakoutUnit.name}
            className={breakoutUnit.className}
            anchorOffsetMilli={cursorMilli - encounter.startMilli}
            anchorAbsoluteMilli={cursorMilli}
            events={breakoutEvents}
            window={breakoutWindow}
            onWindowChange={setBreakoutWindow}
            sharedFightOffsetMilli={sharedFightOffsetMilli}
            onSharedFightOffsetChange={setSharedFightOffsetMilli}
            onClose={() => closeBreakout(unitId)}
            windowSuffix="seconds before playhead"
          />
        </FloatingIncomingEventsBreakout>
      );
    }) : null}
    </>
  );
}
