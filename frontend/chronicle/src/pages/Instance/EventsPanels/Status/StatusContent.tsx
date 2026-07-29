import { useCallback, useMemo, useState } from "react";
import { Activity, Heart, Minus, Plus, Shield, Skull } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { RelativeHealthBar } from "@/components/ui/RelativeHealthBar/RelativeHealthBar";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import { IncomingEventsBreakout, type IncomingEventDisplay } from "../IncomingEvents/IncomingEventsBreakout";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { useInferredRoles } from "../Roles/useInferredRoles";
import type { StatusResult, StatusTimelineEvent, StatusUnitKind } from "./status.processor";
import { statusAmplitudeBaseline, statusEventOpacity, statusMarkerAmplitude } from "./statusAmplitude";
import { sortStatusSnapshotsByRole } from "./statusRoles";
import {
  selectStatusEncounter,
  snapshotStatusUnit,
  statusCursorMilli,
  type StatusUnitSnapshot,
} from "./statusTimeline";
import {
  STATUS_WINDOW_PRESETS,
  parseStatusWindow,
  updateStatusWindow,
  type StatusWindowPreset,
  type StatusWindowPresetId,
} from "./statusWindow";

type StatusUnitMode = "players" | "pets" | "bosses" | "adds";

const UNIT_MODE_PREFIX = "u:";
const UNIT_MODES: { value: StatusUnitMode; label: string }[] = [
  { value: "players", label: "Players" },
  { value: "pets", label: "Pets" },
  { value: "bosses", label: "Bosses" },
  { value: "adds", label: "Adds" },
];

function parseUnitMode(option: string | null | undefined): StatusUnitMode {
  const token = option?.split(",").find((value) => value.startsWith(UNIT_MODE_PREFIX));
  const value = token?.slice(UNIT_MODE_PREFIX.length);
  return value === "pets" || value === "bosses" || value === "adds" ? value : "players";
}

function updateUnitMode(option: string | null | undefined, mode: StatusUnitMode): string | null {
  const tokens = option?.split(",").filter((value) =>
    value && !value.startsWith(UNIT_MODE_PREFIX) && !value.startsWith(FOCUS_PREFIX)
  ) ?? [];
  if (mode !== "players") tokens.push(`${UNIT_MODE_PREFIX}${mode}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

const FOCUS_PREFIX = "f:";

function parseFocus(option: string | null | undefined): string | null {
  const token = option?.split(",").find((value) => value.startsWith(FOCUS_PREFIX));
  return token ? token.slice(FOCUS_PREFIX.length) : null;
}

function updateFocus(option: string | null | undefined, unitId: string | null): string | null {
  const tokens = option?.split(",").filter((value) => value && !value.startsWith(FOCUS_PREFIX)) ?? [];
  if (unitId) tokens.push(`${FOCUS_PREFIX}${unitId}`);
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

function eventColor(event: StatusTimelineEvent): string {
  switch (event.kind) {
    case "damage":
    case "death":
      return "bg-red-500";
    case "heal":
      return "bg-emerald-400";
    case "absorbed":
      return "bg-sky-400";
    case "cast_fail":
      return "bg-zinc-500";
    case "cast_start":
      return "bg-amber-300";
    case "cast":
      return "bg-violet-400";
  }
}

function eventTitle(event: StatusTimelineEvent, cursorMilli: number): string {
  const relativeSeconds = (event.timestampMilli - cursorMilli) / 1000;
  const amount = event.amount > 0 ? ` · ${formatNumber(event.amount)}` : "";
  return `${relativeSeconds > 0 ? "+" : ""}${relativeSeconds.toFixed(1)}s · ${event.label}${amount}`;
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

const BAR_HEIGHT_CLASSES: Record<StatusDensity, string> = {
  0: "h-4",
  1: "h-5",
  2: "h-6",
};

function DamageEventTooltip({ event, targetName }: { event: StatusTimelineEvent; targetName: string }) {
  return (
    <TooltipContent
      side="top"
      sideOffset={6}
      hideArrow
      className="min-w-52 border border-border bg-card px-3 py-2 text-card-foreground shadow-xl"
    >
      <div className="mb-1.5 flex items-baseline justify-between gap-4 border-b border-border/60 pb-1.5">
        <span className="font-semibold text-foreground">{event.label}</span>
        {event.spellId !== null ? (
          <span className="font-mono text-[9px] text-muted-foreground">#{event.spellId}</span>
        ) : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
        <dt className="text-muted-foreground">Caster</dt>
        <dd className="text-right font-medium text-foreground">{event.sourceName || "Unknown"}</dd>
        <dt className="text-muted-foreground">Target</dt>
        <dd className="text-right font-medium text-foreground">{targetName}</dd>
        <dt className="text-muted-foreground">Damage</dt>
        <dd className="text-right font-mono font-semibold text-red-400">{formatNumber(event.amount)}</dd>
      </dl>
    </TooltipContent>
  );
}

function DeathEventMarker({
  event,
  targetName,
  left,
  cursorMilli,
  opacity,
}: {
  event: StatusTimelineEvent;
  targetName: string;
  left: number;
  cursorMilli: number;
  opacity: number;
}) {
  return (
    <HintTooltip delayDuration={75}>
      <TooltipTrigger asChild>
        <span
          className="absolute inset-y-0 z-30 w-4 -translate-x-1/2 cursor-default"
          style={{
            left: `${Math.max(0, Math.min(100, left))}%`,
            opacity,
          }}
          aria-label={eventTitle(event, cursorMilli)}
        >
          <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]" />
          <span className="absolute left-1/2 top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-red-300/80 bg-red-950 text-red-200 shadow-[0_0_8px_rgba(239,68,68,0.85)] transition-transform hover:scale-125">
            <Skull className="h-2.5 w-2.5" />
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        hideArrow
        className="min-w-52 border border-red-500/40 bg-card px-3 py-2 text-card-foreground shadow-xl"
      >
        <div className="mb-1.5 flex items-center gap-2 border-b border-red-500/30 pb-1.5 font-semibold text-red-300">
          <Skull className="h-3.5 w-3.5" />
          {targetName} died
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
          <dt className="text-muted-foreground">Killed by</dt>
          <dd className="text-right font-medium text-foreground">{event.sourceName || "Unknown"}</dd>
          <dt className="text-muted-foreground">Final hit</dt>
          <dd className="text-right font-medium text-foreground">{event.label}</dd>
          {event.amount > 0 ? (
            <>
              <dt className="text-muted-foreground">Damage</dt>
              <dd className="text-right font-mono font-semibold text-red-400">{formatNumber(event.amount)}</dd>
            </>
          ) : null}
        </dl>
      </TooltipContent>
    </HintTooltip>
  );
}

function ActivityLane({
  snapshot,
  cursorMilli,
  density,
  windowPreset,
  amplitudeBaseline,
}: {
  snapshot: StatusUnitSnapshot;
  cursorMilli: number;
  density: StatusDensity;
  windowPreset: StatusWindowPreset;
  amplitudeBaseline: number;
}) {
  const visible = [...snapshot.recentActivity, ...snapshot.incoming].filter(
    (event) => event.kind === "damage" || event.kind === "heal" || event.kind === "absorbed" || event.kind === "death",
  );
  const laneWindowMilli = windowPreset.historyMilli + windowPreset.futureMilli;
  const startMilli = cursorMilli - windowPreset.historyMilli;
  const playheadPercent = windowPreset.historyMilli / laneWindowMilli * 100;
  return (
    <div className={cn("relative overflow-hidden border border-border/30 bg-black/15", BAR_HEIGHT_CLASSES[density])}>
      <div className="absolute inset-y-0 z-10 w-px bg-amber-200/70" style={{ left: `${playheadPercent}%` }} />
      {visible.map((event) => {
        const left = ((event.timestampMilli - startMilli) / laneWindowMilli) * 100;
        const opacity = statusEventOpacity(
          event.timestampMilli,
          cursorMilli,
          windowPreset.historyMilli,
        );
        if (event.kind === "death") {
          return (
            <DeathEventMarker
              key={`${event.eventIndex}:${event.timestampMilli}:${event.kind}`}
              event={event}
              targetName={snapshot.unit.name}
              left={left}
              cursorMilli={cursorMilli}
              opacity={opacity}
            />
          );
        }
        const amplitude = statusMarkerAmplitude(event.kind, event.amount, amplitudeBaseline);
        const laneHeight = density === 0 ? 10 : 12;
        const marker = (
          <span
            key={`${event.eventIndex}:${event.timestampMilli}:${event.kind}`}
            className={cn(
              "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[1px] border-0 shadow-none ring-0 transition-[filter,transform] hover:z-20 hover:brightness-125",
              amplitude.color === null && eventColor(event),
            )}
            style={{
              left: `${Math.max(0, Math.min(100, left))}%`,
              width: `${amplitude.width}px`,
              height: `${laneHeight * amplitude.heightScale}px`,
              backgroundColor: amplitude.color ?? undefined,
              opacity,
            }}
            title={event.kind === "damage" ? undefined : eventTitle(event, cursorMilli)}
            aria-label={eventTitle(event, cursorMilli)}
          />
        );
        return event.kind === "damage" ? (
          <HintTooltip key={`${event.eventIndex}:${event.timestampMilli}:${event.kind}`} delayDuration={75}>
            <TooltipTrigger asChild>{marker}</TooltipTrigger>
            <DamageEventTooltip event={event} targetName={snapshot.unit.name} />
          </HintTooltip>
        ) : marker;
      })}
    </div>
  );
}

function RelativeChange({ snapshot, density }: { snapshot: StatusUnitSnapshot; density: StatusDensity }) {
  return (
    <div className="relative">
      <RelativeHealthBar
        messages={snapshot.relativeHealthMessages}
        state={snapshot.relativeHealthState}
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

export function StatusContent(props: PanelRenderProps<StatusResult>) {
  const { result, context, panelOption, setPanelOption } = props;
  const sync = useSyncModeContextOptional();
  const { roles } = useInferredRoles(context);
  const encounter = useMemo(
    () => selectStatusEncounter(result.encounters, context.selectedEncounterIds, sync?.currentTimestamp?.getTime() ?? null),
    [result.encounters, context.selectedEncounterIds, sync?.currentTimestamp],
  );
  const cursorMilli = encounter
    ? statusCursorMilli(encounter, sync?.currentTimestamp ?? null, sync?.enabled ?? false)
    : null;
  const unitMode = parseUnitMode(panelOption);
  const windowPreset = parseStatusWindow(panelOption);
  const enemyGroups = useMemo(() => {
    const selectedEncounter = encounter
      ? context.instance.encounters.find((candidate) => candidate.id === encounter.encounterId)
      : null;
    const bosses = new Set<string>();
    const adds = new Set<string>();
    for (const enemy of selectedEncounter?.enemies ?? []) {
      (enemy.boss ? bosses : adds).add(enemy.id);
    }
    return { bosses, adds };
  }, [context.instance.encounters, encounter]);
  const snapshots = useMemo(() => {
    if (!encounter || cursorMilli === null) return [];
    const matchingSnapshots = Array.from(encounter.units.values())
      .filter((unit) => {
        if (unitMode === "players") return unit.kind === "player";
        if (unitMode === "pets") return unit.kind === "pet";
        if (unitMode === "bosses") return enemyGroups.bosses.has(unit.unitId);
        return enemyGroups.adds.has(unit.unitId);
      })
      .map((unit) => snapshotStatusUnit(
        unit,
        cursorMilli,
        windowPreset.historyMilli,
        windowPreset.futureMilli,
      ));
    return unitMode === "players"
      ? sortStatusSnapshotsByRole(matchingSnapshots, roles)
      : matchingSnapshots.sort((a, b) => a.unit.name.localeCompare(b.unit.name));
  }, [encounter, cursorMilli, enemyGroups, roles, unitMode, windowPreset]);
  const amplitudeBaseline = useMemo(
    () => statusAmplitudeBaseline(snapshots.flatMap((snapshot) => [
      ...snapshot.recentActivity,
      ...snapshot.incoming,
    ])),
    [snapshots],
  );
  const focusedUnitId = parseFocus(panelOption);
  const [floatingBreakout, setFloatingBreakout] = useState<FloatingStatusBreakout | null>(null);
  const [density, setDensity] = useState<StatusDensity>(0);
  const [windowSeconds, setWindowSeconds] = useState(30);
  const [sharedFightOffsetMilli, setSharedFightOffsetMilli] = useState<number | null>(null);
  const breakoutUnit = floatingBreakout && encounter
    ? encounter.units.get(floatingBreakout.unitId) ?? null
    : null;
  const breakoutEvents = useMemo(
    () => breakoutUnit?.events.map(toIncomingEvent).filter((event): event is IncomingEventDisplay => event !== null) ?? [],
    [breakoutUnit],
  );

  const selectUnit = useCallback((unitId: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const x = Math.max(8, Math.min(rect.right + 8, window.innerWidth - 640));
    const y = Math.max(8, Math.min(rect.top, window.innerHeight - 520));
    setFloatingBreakout({ unitId, initialPosition: { x, y } });
    setPanelOption?.(updateFocus(panelOption, unitId));
  }, [panelOption, setPanelOption]);

  const closeBreakout = useCallback(() => {
    setFloatingBreakout(null);
    setSharedFightOffsetMilli(null);
    setPanelOption?.(updateFocus(panelOption, null));
  }, [panelOption, setPanelOption]);

  const selectUnitMode = useCallback((mode: StatusUnitMode) => {
    setFloatingBreakout(null);
    setSharedFightOffsetMilli(null);
    setPanelOption?.(updateUnitMode(panelOption, mode));
  }, [panelOption, setPanelOption]);

  const selectWindowPreset = useCallback((presetId: StatusWindowPresetId) => {
    setPanelOption?.(updateStatusWindow(panelOption, presetId));
  }, [panelOption, setPanelOption]);

  return (
    <>
    <GenericPanel {...props}>
      <div className="flex items-center gap-1 border-b border-border/40 px-5 py-1.5">
        {UNIT_MODES.map((mode) => (
          <button
            key={mode.value}
            type="button"
            onClick={() => selectUnitMode(mode.value)}
            className={cn(
              "rounded px-2.5 py-1 text-[10px] font-medium transition-colors",
              unitMode === mode.value
                ? "bg-muted text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {mode.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(185px,0.8fr)_minmax(240px,1.15fr)_minmax(300px,1.6fr)] items-center gap-4 border-b border-border/40 px-5 py-1.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>Unit</span>
        <span>Relative health change</span>
        <span className="flex items-center gap-2">
          <span>Health events</span>
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
      {snapshots.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted-foreground">
          <Activity className="h-5 w-5 opacity-50" />
          <span>No {UNIT_MODES.find((mode) => mode.value === unitMode)?.label.toLowerCase()} matched this panel.</span>
          <span className="text-[10px]">Try another unit group or adjust the panel filters.</span>
        </div>
      ) : (
        <div className="styled-scrollbar min-h-0 flex-1 overflow-auto">
          {snapshots.map((snapshot) => {
            const unit = snapshot.unit;
            const role = unit.kind === "player" ? roles.get(unit.unitId)?.role : undefined;
            const ownerName = unit.ownerId ? context.instance.players?.[unit.ownerId]?.name : null;
            return (
              <button
                key={unit.unitId}
                type="button"
                onClick={(event) => selectUnit(unit.unitId, event.currentTarget)}
                className={cn(
                  "grid w-full grid-cols-[minmax(185px,0.8fr)_minmax(240px,1.15fr)_minmax(300px,1.6fr)] items-center gap-4 border-b border-border/25 text-left transition-colors hover:bg-muted/20",
                  ROW_CLASSES[density],
                  focusedUnitId === unit.unitId && "bg-amber-400/5 ring-1 ring-inset ring-amber-300/30",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  {role === "tank" ? (
                    <Shield className="h-3 w-3 shrink-0 text-amber-500" aria-label="Tank" />
                  ) : role === "healer" ? (
                    <Heart className="h-3 w-3 shrink-0 text-emerald-500" aria-label="Healer" />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: classColor(unit.className, unit.kind) }} />
                  )}
                  <span className={cn("truncate font-semibold", NAME_CLASSES[density])} style={{ color: classColor(unit.className, unit.kind) }}>{unit.name}</span>
                  {unit.kind !== "player" ? (
                    <span className="truncate text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                      {kindLabel(unit.kind)}{ownerName ? ` · ${ownerName}` : ""}
                    </span>
                  ) : null}
                </span>
                <RelativeChange snapshot={snapshot} density={density} />
                <ActivityLane
                  snapshot={snapshot}
                  cursorMilli={cursorMilli!}
                  density={density}
                  windowPreset={windowPreset}
                  amplitudeBaseline={amplitudeBaseline}
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
        <span className="ml-auto">{windowPreset.label}</span>
      </div>
    </GenericPanel>
    {floatingBreakout && breakoutUnit && encounter && cursorMilli !== null ? (
      <FloatingIncomingEventsBreakout
        initialPosition={floatingBreakout.initialPosition}
        onClose={closeBreakout}
      >
        <IncomingEventsBreakout
          unitName={breakoutUnit.name}
          className={breakoutUnit.className}
          anchorOffsetMilli={cursorMilli - encounter.startMilli}
          anchorAbsoluteMilli={cursorMilli}
          events={breakoutEvents}
          windowSeconds={windowSeconds}
          onWindowSecondsChange={setWindowSeconds}
          sharedFightOffsetMilli={sharedFightOffsetMilli}
          onSharedFightOffsetChange={setSharedFightOffsetMilli}
          onClose={closeBreakout}
          windowSuffix="seconds before playhead"
        />
      </FloatingIncomingEventsBreakout>
    ) : null}
    </>
  );
}
