/* eslint-disable react-refresh/only-export-components -- Panel factory and colocated view helpers intentionally share this module. */
import { useState, type CSSProperties, type ReactNode } from "react";
import { RadioTower, Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { parseSelectedUnits } from "../UnitAuras/unitSelection";
import { FloatingIncomingEventsBreakout } from "../IncomingEvents/FloatingIncomingEventsBreakout";
import { PlayerDetail } from "./PlayerDetail";
import { useUnitInspect } from "../UnitInspectContext";
import type { PanelDefinition, PanelRenderProps } from "../types";
import {
  activeCastAt,
  incomingHealsAt,
  enemyFrameUnits,
  latestResourceAt,
  orderRaidFramePlayers,
  raidFramesProcessor,
  type RaidFrameCast,
  type RaidFrameHeal,
  type RaidFrameResourceSample,
  type RaidFramesEncounter,
  type RaidFramesProcessorEvent,
  type RaidFramesResult,
} from "./raidFrames.processor";
import { INCOMING_HEAL_WINDOW_MS, POWER_COLORS, percent, useDisplayTimestamp } from "./raidFrameShared";

export function selectRaidFramesEncounter(
  encounters: ReadonlyMap<string, RaidFramesEncounter>,
  selectedEncounterIds: readonly string[],
  timestampMs: number | null,
): RaidFramesEncounter | null {
  const selected = selectedEncounterIds
    .map((id) => encounters.get(id))
    .filter((encounter): encounter is RaidFramesEncounter => Boolean(encounter));
  if (selected.length === 0) return null;
  if (timestampMs !== null) {
    const atCursor = selected.find(
      (encounter) => encounter.startMs <= timestampMs && timestampMs <= encounter.endMs,
    );
    if (atCursor) return atCursor;
  }
  return selected[selected.length - 1];
}

function UnsupportedMessage() {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      <RadioTower className="h-8 w-8 text-muted-foreground/45" />
      <div className="text-sm font-medium text-foreground">Unit resources unavailable</div>
      <p className="max-w-sm text-xs text-muted-foreground">
        This log does not support unit resources, so raid frames cannot be displayed.
      </p>
    </div>
  );
}

function PanelMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 p-6 text-center">
      <Users className="h-8 w-8 text-muted-foreground/45" />
      <div className="text-sm font-medium text-foreground">{title}</div>
      <p className="max-w-sm text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function CastBar({ cast, timestampMs }: { cast: RaidFrameCast | null; timestampMs: number }) {
  if (!cast) return <div className="h-3 bg-background/40" />;
  return <ActiveCastBar cast={cast} timestampMs={timestampMs} />;
}

function ActiveCastBar({ cast, timestampMs }: { cast: RaidFrameCast; timestampMs: number }) {
  const displayMs = useDisplayTimestamp(timestampMs);
  const durationMs = Math.max(1, cast.endMs - cast.startMs);
  const elapsed = Math.min(durationMs, Math.max(0, displayMs - cast.startMs));
  const progress = percent(elapsed, durationMs);
  const width = cast.channel ? 100 - progress : progress;
  return (
    <div className="relative h-3 overflow-hidden bg-background/40">
      <div
        className="absolute inset-y-0 left-0 bg-amber-500/35"
        style={{ width: `${width}%` }}
      />
      <span className="absolute inset-0 truncate px-1.5 font-mono text-[9px] leading-3 text-amber-200/90">
        {cast.spellName}
      </span>
    </div>
  );
}

function ResourceBar({ sample }: { sample: RaidFrameResourceSample | null }) {
  const powerType = sample?.powerType ?? "";
  const powerWidth = sample ? percent(sample.currentPower, sample.maximumPower) : 0;
  const color = POWER_COLORS[powerType] ?? "#767676";
  return (
    <div className="h-1 bg-background/70">
      {sample && sample.maximumPower > 0 && (
        <div className="h-full opacity-75 transition-[width] duration-100" style={{ width: `${powerWidth}%`, background: color }} />
      )}
    </div>
  );
}

// Light green segments after the health (and absorb) fill for heals landing
// within the window; each fades in as its landing time approaches. Details
// live in the frame tooltip, which highlights the hovered segment's heal.
function IncomingHeals({
  heals,
  maximumHealth,
  startPercent,
  timestampMs,
  onHoverHeal,
}: {
  heals: readonly RaidFrameHeal[];
  maximumHealth: number;
  startPercent: number;
  timestampMs: number;
  onHoverHeal: (heal: RaidFrameHeal | null) => void;
}) {
  const displayMs = useDisplayTimestamp(timestampMs);

  const segments: ReactNode[] = [];
  let left = startPercent;
  for (const [index, heal] of heals.entries()) {
    if (heal.landMs <= displayMs) continue;
    if (left >= 100) break;
    const width = Math.min(percent(heal.amount, maximumHealth), 100 - left);
    const progress = 1 - (heal.landMs - displayMs) / INCOMING_HEAL_WINDOW_MS;
    segments.push(
      <div
        key={index}
        className="absolute inset-y-0 bg-green-300"
        style={{ left: `${left}%`, width: `${width}%`, opacity: 0.1 + 0.45 * Math.max(0, progress) }}
        onPointerEnter={() => onHoverHeal(heal)}
        onPointerLeave={() => onHoverHeal(null)}
      />,
    );
    left += width;
  }
  return segments;
}

function StatRow({
  label,
  color,
  value,
  detail,
}: {
  label: string;
  color: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: color }} />
      <span className="text-zinc-400">{label}</span>
      <span className="ml-auto font-mono tabular-nums text-zinc-100">{value}</span>
      <span className="w-9 text-right font-mono tabular-nums text-zinc-500">{detail}</span>
    </div>
  );
}

// Rendered only while the tooltip is open, so the interpolation hook doesn't
// run for every frame in the grid.
function RaidFrameTooltip({
  name,
  classColor,
  sample,
  cast,
  incomingHeals,
  hoveredHeal,
  spellNames,
  timestampMs,
  dead,
  nameplate = false,
}: {
  name: string;
  classColor: string;
  sample: RaidFrameResourceSample | null;
  cast: RaidFrameCast | null;
  incomingHeals: readonly RaidFrameHeal[];
  hoveredHeal: RaidFrameHeal | null;
  spellNames: ReadonlyMap<number, string>;
  timestampMs: number;
  dead: boolean;
  /** Health and power as nameplate bars with their values on them, instead of rows. */
  nameplate?: boolean;
}) {
  const displayMs = useDisplayTimestamp(timestampMs);
  const pending = dead ? [] : incomingHeals.filter((heal) => heal.landMs > displayMs);
  const powerType = sample?.powerType ?? "";
  const powerLabel = powerType ? `${powerType.charAt(0).toUpperCase()}${powerType.slice(1)}` : "Resource";
  const hasHealth = sample !== null && sample.maximumHealth > 0;
  const hasPower = sample !== null && sample.maximumPower > 0;

  return (
    <div className={`flex flex-col gap-1.5 text-xs ${nameplate ? "w-60" : "min-w-52"}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold" style={{ color: classColor }}>{name}</span>
        {dead && <span className="text-2xs uppercase tracking-wide text-red-400">Dead</span>}
      </div>
      {nameplate ? (
        <div className="flex flex-col gap-1">
          {hasHealth ? (
            <NameplateBar color={classColor} current={sample.currentHealth} max={sample.maximumHealth} absorb={sample.absorb} height="h-6 text-xs" />
          ) : (
            <div className="text-zinc-500">No health data yet</div>
          )}
          {hasPower && (
            <NameplateBar color={POWER_COLORS[powerType] ?? "#767676"} current={sample.currentPower} max={sample.maximumPower} height="h-4 text-[10px]" />
          )}
        </div>
      ) : (
      <div className="flex flex-col gap-0.5">
        <StatRow
          label="Health"
          color={classColor}
          value={hasHealth ? `${sample.currentHealth.toLocaleString()} / ${sample.maximumHealth.toLocaleString()}` : "No data"}
          detail={hasHealth ? `${Math.round(percent(sample.currentHealth, sample.maximumHealth))}%` : undefined}
        />
        {sample && sample.absorb > 0 && (
          <StatRow label="Absorb" color="#bae6fd" value={`+${sample.absorb.toLocaleString()}`} />
        )}
        <StatRow
          label={powerLabel}
          color={POWER_COLORS[powerType] ?? "#767676"}
          value={hasPower ? `${sample.currentPower.toLocaleString()} / ${sample.maximumPower.toLocaleString()}` : "No data"}
          detail={hasPower ? `${Math.round(percent(sample.currentPower, sample.maximumPower))}%` : undefined}
        />
      </div>
      )}
      {cast && (
        <div className="flex items-baseline justify-between gap-3 border-t border-white/10 pt-1.5">
          <span className="min-w-0 truncate text-amber-200">
            <span className="text-zinc-400">{cast.channel ? "Channeling " : "Casting "}</span>
            {cast.spellName}
          </span>
          <span className="shrink-0 font-mono text-2xs tabular-nums text-zinc-500">
            {(Math.max(0, cast.endMs - displayMs) / 1000).toFixed(1)}s
          </span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="flex flex-col gap-0.5 border-t border-white/10 pt-1.5">
          <div className="flex items-baseline justify-between text-2xs uppercase tracking-wide text-zinc-500">
            <span>Incoming heals</span>
            <span className="font-mono tabular-nums text-green-300">
              +{pending.reduce((total, heal) => total + heal.amount, 0).toLocaleString()}
            </span>
          </div>
          {pending.map((heal, index) => {
            const spellName = (heal.spellId != null ? spellNames.get(heal.spellId) : undefined) ?? "Unknown heal";
            return (
              <div
                key={index}
                className={`-mx-1 rounded-sm px-1 py-0.5 ${heal === hoveredHeal ? "bg-green-300/15" : ""}`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-green-300">{spellName}</span>
                  <span className="font-mono tabular-nums">
                    +{heal.amount.toLocaleString()}
                    {heal.overheal > 0 && (
                      <span className="text-zinc-500"> ({heal.overheal.toLocaleString()} OH)</span>
                    )}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 text-2xs text-zinc-500">
                  <span>from {heal.sourceName || "Unknown"}</span>
                  <span className="font-mono tabular-nums">
                    in {(Math.max(0, heal.landMs - displayMs) / 1000).toFixed(1)}s
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RaidFrame({
  name,
  className,
  sample,
  cast,
  incomingHeals,
  spellNames,
  timestampMs,
  showValues,
  selected = false,
  onClick,
}: {
  name: string;
  className: string;
  sample: RaidFrameResourceSample | null;
  cast: RaidFrameCast | null;
  incomingHeals: readonly RaidFrameHeal[];
  spellNames: ReadonlyMap<number, string>;
  timestampMs: number;
  showValues: boolean;
  /** This frame's player has a breakout open. */
  selected?: boolean;
  onClick?: (target: HTMLElement) => void;
}) {
  const [hoveredHeal, setHoveredHeal] = useState<RaidFrameHeal | null>(null);
  const healthWidth = sample ? percent(sample.currentHealth, sample.maximumHealth) : 0;
  const absorbWidth = sample
    ? Math.min(percent(sample.absorb, sample.maximumHealth), 100 - healthWidth)
    : 0;
  const healthText = sample && sample.maximumHealth > 0
    ? showValues
      ? `${sample.currentHealth}/${sample.maximumHealth}`
      : `${Math.round(healthWidth)}%`
    : "No data";
  const dead = sample?.currentHealth === 0 && (sample?.maximumHealth ?? 0) > 0;
  const classColor = getClassColorVar(className || "unknown");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`min-w-0 overflow-hidden rounded-sm border border-border/60 bg-muted/30 ${dead ? "opacity-50 grayscale" : ""} ${onClick ? "cursor-pointer hover:border-foreground/40" : ""} ${selected ? "ring-2 ring-inset" : ""}`}
          style={selected ? { "--tw-ring-color": classColor } as CSSProperties : undefined}
          onClick={onClick && ((event) => onClick(event.currentTarget))}
        >
          <CastBar cast={cast} timestampMs={timestampMs} />
          <div className="relative h-8 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-100"
              style={{
                width: `${healthWidth}%`,
                background: `color-mix(in oklch, ${classColor} 35%, transparent)`,
                borderRight: healthWidth > 0 && healthWidth < 100 ? `1px solid ${classColor}` : undefined,
              }}
            />
            <div className="absolute inset-y-0 left-0 w-[3px]" style={{ background: classColor }} />
            {absorbWidth > 0 && (
              <div
                className="absolute inset-y-0 bg-sky-200/20"
                style={{ left: `${healthWidth}%`, width: `${absorbWidth}%` }}
              />
            )}
            {sample && sample.maximumHealth > 0 && incomingHeals.length > 0 && !dead && (
              <IncomingHeals
                heals={incomingHeals}
                maximumHealth={sample.maximumHealth}
                startPercent={healthWidth + absorbWidth}
                timestampMs={timestampMs}
                onHoverHeal={setHoveredHeal}
              />
            )}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-between gap-1 pl-2.5 pr-1.5">
              <span className="min-w-0 truncate text-xs font-medium text-foreground">
                {dead ? `☠ ${name}` : name}
              </span>
              <span className="shrink-0 font-mono text-2xs tabular-nums text-muted-foreground">
                {healthText}
              </span>
            </div>
          </div>
          <ResourceBar sample={sample} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4} className="px-2.5 py-2 text-left" hideArrow>
        <RaidFrameTooltip
          name={name}
          classColor={classColor}
          sample={sample}
          cast={cast}
          incomingHeals={incomingHeals}
          hoveredHeal={hoveredHeal}
          spellNames={spellNames}
          timestampMs={timestampMs}
          dead={dead}
        />
      </TooltipContent>
    </Tooltip>
  );
}

// A nameplate-sized bar with its values written on it.
function NameplateBar({ color, current, max, absorb = 0, height }: { color: string; current: number; max: number; absorb?: number; height: string }) {
  const fill = percent(current, max);
  const shield = Math.min(percent(absorb, max), 100 - fill);
  return (
    // The empty track is a dim tint of the bar colour so the fill's end reads against the dark tooltip.
    <div className={`relative ${height} overflow-hidden rounded-sm border border-white/25`} style={{ background: `color-mix(in srgb, ${color} 22%, #27272a)` }}>
      <div className="absolute inset-y-0 left-0" style={{ width: `${fill}%`, background: color }} />
      {shield > 0 && <div className="absolute inset-y-0 bg-white/50" style={{ left: `${fill}%`, width: `${shield}%` }} />}
      <span className="absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums text-white [text-shadow:0_0_2px_#000,0_0_2px_#000,0_0_2px_#000]">
        {current.toLocaleString()} / {max.toLocaleString()}
        {absorb > 0 && <span className="ml-1 text-white/80">+{absorb.toLocaleString()}</span>}
      </span>
    </div>
  );
}

// The overlay frame (over the map): a solid class-coloured health bar with the
// name on it and a thin power bar, plus the card frame's casts, absorbs and
// incoming heals.
function OverlayRaidFrame({
  guid,
  name,
  className,
  sample,
  cast,
  incomingHeals,
  spellNames,
  timestampMs,
}: {
  guid?: string;
  name: string;
  className: string;
  sample: RaidFrameResourceSample | null;
  cast: RaidFrameCast | null;
  incomingHeals: readonly RaidFrameHeal[];
  spellNames: ReadonlyMap<number, string>;
  timestampMs: number;
}) {
  const [hoveredHeal, setHoveredHeal] = useState<RaidFrameHeal | null>(null);
  const inspect = useUnitInspect();
  const inspected = Boolean(guid && inspect?.inspected.has(guid));
  const dead = sample?.currentHealth === 0 && (sample?.maximumHealth ?? 0) > 0;
  const healthWidth = sample && !dead ? percent(sample.currentHealth, sample.maximumHealth) : 0;
  const absorbWidth = sample && !dead ? Math.min(percent(sample.absorb, sample.maximumHealth), 100 - healthWidth) : 0;
  const classColor = getClassColorVar(className || "unknown");
  const powerType = sample?.powerType ?? "";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`pointer-events-auto flex w-20 flex-col overflow-hidden rounded-sm border bg-black/80 ${inspected ? "border-white ring-1 ring-white/70" : "border-black/80"} ${dead ? "opacity-60" : ""} ${inspect && guid ? "cursor-pointer" : ""}`}
          onClick={inspect && guid ? () => inspect.select(guid) : undefined}
        >
          <div className="relative h-4">
            <div className="absolute inset-y-0 left-0" style={{ width: `${healthWidth}%`, background: classColor }} />
            {absorbWidth > 0 && (
              <div className="absolute inset-y-0 bg-white/50" style={{ left: `${healthWidth}%`, width: `${absorbWidth}%` }} />
            )}
            {sample && sample.maximumHealth > 0 && incomingHeals.length > 0 && !dead && (
              <IncomingHeals
                heals={incomingHeals}
                maximumHealth={sample.maximumHealth}
                startPercent={healthWidth + absorbWidth}
                timestampMs={timestampMs}
                onHoverHeal={setHoveredHeal}
              />
            )}
            <span className="pointer-events-none absolute inset-0 truncate px-1 text-[9px] font-semibold leading-4 text-white [text-shadow:0_0_2px_#000,0_0_2px_#000]">
              {dead ? `☠ ${name}` : name}
            </span>
          </div>
          {cast && !dead && <OverlayCastLine cast={cast} timestampMs={timestampMs} />}
          <div className="h-1 bg-black/60">
            {sample && sample.maximumPower > 0 && !dead && (
              <div className="h-full" style={{ width: `${percent(sample.currentPower, sample.maximumPower)}%`, background: POWER_COLORS[powerType] ?? "#767676" }} />
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" sideOffset={6}>
        <RaidFrameTooltip
          name={name}
          classColor={classColor}
          sample={sample}
          cast={cast}
          incomingHeals={incomingHeals}
          hoveredHeal={hoveredHeal}
          spellNames={spellNames}
          timestampMs={timestampMs}
          dead={dead}
          nameplate
        />
      </TooltipContent>
    </Tooltip>
  );
}

// A thin amber progress line while casting (channels drain), under the health bar.
function OverlayCastLine({ cast, timestampMs }: { cast: RaidFrameCast; timestampMs: number }) {
  const displayMs = useDisplayTimestamp(timestampMs);
  const durationMs = Math.max(1, cast.endMs - cast.startMs);
  const progress = percent(Math.min(durationMs, Math.max(0, displayMs - cast.startMs)), durationMs);
  return (
    <div className="h-0.5 bg-black/60">
      <div className="h-full bg-amber-400" style={{ width: `${cast.channel ? 100 - progress : progress}%` }} />
    </div>
  );
}

// One unit up close: name, health and power with their values, and the cast in progress.
function InspectFrame({
  guid,
  context,
  sample,
  cast,
  timestampMs,
}: {
  guid: string;
  context: PanelRenderProps<RaidFramesResult>["context"];
  sample: RaidFrameResourceSample | null;
  cast: RaidFrameCast | null;
  timestampMs: number;
}) {
  const player = context.instance.players?.[guid];
  const name = player?.name ?? context.instance.units?.[guid]?.name ?? guid;
  const color = player ? getClassColorVar(player.class) : "var(--color-class-enemy)";
  const dead = sample?.currentHealth === 0 && (sample?.maximumHealth ?? 0) > 0;
  const powerType = sample?.powerType ?? "";
  return (
    <div className={`flex flex-col gap-0.5 ${dead ? "opacity-60" : ""}`}>
      <div className="flex items-baseline gap-2 pr-4 text-[11px] leading-tight">
        <span className="truncate font-semibold" style={{ color }}>{name}</span>
        {dead && <span className="text-2xs uppercase tracking-wide text-red-400">Dead</span>}
      </div>
      {sample && sample.maximumHealth > 0 ? (
        <NameplateBar color={color} current={sample.currentHealth} max={sample.maximumHealth} absorb={sample.absorb} height="h-4 text-[10px]" />
      ) : (
        <div className="text-2xs text-zinc-500">No health data yet</div>
      )}
      {sample && sample.maximumPower > 0 && (
        <NameplateBar color={POWER_COLORS[powerType] ?? "#767676"} current={sample.currentPower} max={sample.maximumPower} height="h-3 text-[8px]" />
      )}
      {cast && !dead && <InspectCastBar cast={cast} timestampMs={timestampMs} />}
    </div>
  );
}

function InspectCastBar({ cast, timestampMs }: { cast: RaidFrameCast; timestampMs: number }) {
  const displayMs = useDisplayTimestamp(timestampMs);
  const durationMs = Math.max(1, cast.endMs - cast.startMs);
  const progress = percent(Math.min(durationMs, Math.max(0, displayMs - cast.startMs)), durationMs);
  return (
    <div className="relative h-3.5 overflow-hidden rounded-sm border border-amber-500/40 bg-black/60">
      <div className="absolute inset-y-0 left-0 bg-amber-500/45" style={{ width: `${cast.channel ? 100 - progress : progress}%` }} />
      <span className="absolute inset-0 flex items-center justify-between gap-2 px-1 text-[9px] leading-none text-amber-100 [text-shadow:0_0_2px_#000]">
        <span className="truncate">{cast.spellName}</span>
        <span className="shrink-0 font-mono tabular-nums">{(Math.max(0, cast.endMs - displayMs) / 1000).toFixed(1)}s</span>
      </span>
    </div>
  );
}

/** Panel option token for enemy raid frames. */
const ENEMIES_OPTION = "enemies";

const BREAKOUT_WIDTH = 400;

interface PlayerBreakout {
  guid: string;
  initialPosition: { x: number; y: number };
}

function RaidFramesContent(props: PanelRenderProps<RaidFramesResult>) {
  const sync = useSyncModeContextOptional();
  // Clicked players' detail breakouts; several can be open at once.
  const [breakouts, setBreakouts] = useState<PlayerBreakout[]>([]);
  const overlay = props.variant === "overlay";
  const capabilities = props.context.instance.capabilities ?? [];
  if (!capabilities.includes("unit-resources")) return overlay ? null : <UnsupportedMessage />;
  // An overlay shows frames or nothing; the host has no room for messages.
  if (overlay && (props.loading || props.error)) return null;
  if (props.loading) {
    return <PanelMessage title="Loading raid frames" detail="Reading health, resource, and cast telemetry…" />;
  }
  if (props.error) {
    return <PanelMessage title="Raid frames unavailable" detail={props.error.message} />;
  }

  const syncTimestampMs = sync?.enabled && sync.currentTimestamp
    ? sync.currentTimestamp.getTime()
    : null;
  const encounter = selectRaidFramesEncounter(
    props.result.encounters,
    props.context.selectedEncounterIds,
    syncTimestampMs,
  );
  if (!encounter) {
    return overlay ? null : <PanelMessage title="No unit resources" detail="The selected encounter has no unit-resource samples." />;
  }

  const timestampMs = syncTimestampMs ?? encounter.endMs;

  // Inspect mode (`u:<guid>` in the panel option): a larger frame for each
  // listed unit, players or enemies.
  const inspectGuids = parseSelectedUnits(props.panelOption);
  if (inspectGuids.length > 0) {
    return (
      <div className="flex flex-col gap-1">
        {inspectGuids.map((guid) => (
          <InspectFrame
            key={guid}
            guid={guid}
            context={props.context}
            sample={latestResourceAt(encounter.resourcesByUnit.get(guid) ?? [], timestampMs)}
            cast={activeCastAt(encounter.castsByUnit.get(guid) ?? [], timestampMs)}
            timestampMs={timestampMs}
          />
        ))}
      </div>
    );
  }
  // Enemies mode (`enemies` in the panel option): the encounter's enemies
  // instead of the players, coloured as enemies.
  const enemiesMode = (props.panelOption ?? "").split(",").includes(ENEMIES_OPTION);
  const instancePlayers = props.context.instance.players ?? {};
  const units = props.context.instance.units ?? {};
  // The encounter's own enemy list: who counts, and who is a boss.
  const encounterEnemies = props.context.instance.encounters.find((candidate) => candidate.id === encounter.encounterId)?.enemies ?? [];
  const bossGuids = new Set(encounterEnemies.filter((enemy) => enemy.boss).map((enemy) => enemy.id));
  const encounterEnemyGuids = new Set(encounterEnemies.map((enemy) => enemy.id));
  const players: (readonly [string, { name: string; class: string }])[] = enemiesMode
    ? enemyFrameUnits(
        encounter,
        (guid) => Boolean(instancePlayers[guid]),
        (guid) => units[guid]?.owner?.toString() ?? null,
        (guid) => units[guid]?.name ?? guid,
        bossGuids,
        encounterEnemyGuids,
      ).map(({ guid, name }) => [guid, { name, class: "enemy" }] as const)
    : Object.entries(instancePlayers)
      .sort(([, left], [, right]) => left.class.localeCompare(right.class) || left.name.localeCompare(right.name));
  if (players.length === 0) {
    return overlay ? null : enemiesMode
      ? <PanelMessage title="No enemies" detail="The selected encounter has no enemy health data." />
      : <PanelMessage title="No players" detail="This log does not list any players for the selected encounter." />;
  }

  // Raid groups (the Raid Composition panel's layout) when the log has them;
  // null entries pad a group so the next starts its own column.
  const ordered = enemiesMode ? players : orderRaidFramePlayers(players, props.result.composition.groups);
  const frameData = ordered.map((entry) => entry && ({
    guid: entry[0],
    player: entry[1],
    sample: latestResourceAt(encounter.resourcesByUnit.get(entry[0]) ?? [], timestampMs),
    cast: activeCastAt(encounter.castsByUnit.get(entry[0]) ?? [], timestampMs),
    incomingHeals: incomingHealsAt(encounter.healsByUnit.get(entry[0]) ?? [], timestampMs, INCOMING_HEAL_WINDOW_MS),
  }));

  if (overlay) {
    // Columns of five like the in-game raid frames; the host positions it.
    return (
      <TooltipProvider>
        <div aria-label={enemiesMode ? "Enemy frames" : "Raid frames"} className="pointer-events-none grid grid-flow-col grid-rows-[repeat(5,auto)] gap-0.5">
          {frameData.map((frame, index) => frame === null ? <div key={`empty-${index}`} aria-hidden /> : (
            <OverlayRaidFrame
              key={frame.guid}
              guid={frame.guid}
              name={frame.player.name}
              className={frame.player.class}
              sample={frame.sample}
              cast={frame.cast}
              incomingHeals={frame.incomingHeals}
              spellNames={props.result.spellNames}
              timestampMs={timestampMs}
            />
          ))}
        </div>
      </TooltipProvider>
    );
  }

  const toggleBreakout = (guid: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const view = target.ownerDocument.defaultView;
    const x = Math.max(8, Math.min(rect.right + 8, (view?.innerWidth ?? 640) - BREAKOUT_WIDTH - 8));
    const y = Math.max(8, Math.min(rect.top, (view?.innerHeight ?? 480) - 420));
    setBreakouts((previous) => previous.some((breakout) => breakout.guid === guid)
      ? previous.filter((breakout) => breakout.guid !== guid)
      : [...previous, { guid, initialPosition: { x, y } }]);
  };
  const closeBreakout = (guid: string) => setBreakouts((previous) => previous.filter((breakout) => breakout.guid !== guid));
  // Previous / next moves a breakout to another player, closing any other breakout already on them.
  const moveBreakout = (from: string, to: string) => setBreakouts((previous) => previous
    .filter((breakout) => breakout.guid !== to)
    .map((breakout) => breakout.guid === from ? { ...breakout, guid: to } : breakout));
  const playerOrder = frameData.flatMap((frame) => frame ? [frame.guid] : []);

  return (
    <div className="styled-scrollbar h-full min-h-0 overflow-auto p-1">
      <div className="grid min-w-max grid-flow-col grid-rows-[repeat(5,minmax(0,1fr))] auto-cols-[minmax(7.5rem,1fr)] gap-1">
        {frameData.map((frame, index) => {
          if (frame === null) return <div key={`empty-${index}`} aria-hidden />;
          const { guid, player, sample, cast, incomingHeals } = frame;
          return (
            <RaidFrame
              key={guid}
              name={player.name}
              className={player.class}
              sample={sample}
              cast={cast}
              incomingHeals={incomingHeals}
              spellNames={props.result.spellNames}
              timestampMs={timestampMs}
              showValues={props.checkboxChecked}
              selected={breakouts.some((breakout) => breakout.guid === guid)}
              onClick={enemiesMode ? undefined : (target) => toggleBreakout(guid, target)}
            />
          );
        })}
      </div>
      {breakouts.map((breakout) => (
        <FloatingIncomingEventsBreakout
          key={breakout.guid}
          initialPosition={breakout.initialPosition}
          onClose={() => closeBreakout(breakout.guid)}
        >
          <TooltipProvider>
            <PlayerDetail
              guid={breakout.guid}
              props={props}
              encounter={encounter}
              timestampMs={timestampMs}
              sample={latestResourceAt(encounter.resourcesByUnit.get(breakout.guid) ?? [], timestampMs)}
              cast={activeCastAt(encounter.castsByUnit.get(breakout.guid) ?? [], timestampMs)}
              incomingHeals={incomingHealsAt(encounter.healsByUnit.get(breakout.guid) ?? [], timestampMs, INCOMING_HEAL_WINDOW_MS)}
              playerOrder={playerOrder}
              onSelect={(guid) => guid ? moveBreakout(breakout.guid, guid) : closeBreakout(breakout.guid)}
            />
          </TooltipProvider>
        </FloatingIncomingEventsBreakout>
      ))}
    </div>
  );
}

export function createRaidFramesPanel(): PanelDefinition<RaidFramesResult, RaidFramesProcessorEvent> {
  return {
    ...raidFramesProcessor,
    label: "Raid Frames",
    icon: <Users className="h-4 w-4" />,
    keybinds: [],
    requiredCapabilities: ["unit-resources"],
    syncDataMode: "full",
    disableCardFlip: true,
    supportsFiltering: false,
    checkboxLabel: "Values",
    renderOnlyOptionTokens: ["cb"],
    render: (props) => <RaidFramesContent {...props} />,
  };
}
