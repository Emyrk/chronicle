import { useMemo, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay";
import { cn } from "@/lib/utils";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { useInferredRoles } from "../Roles/useInferredRoles";
import { createUnitAurasPanel } from "../UnitAuras/UnitAuras";
import type { PanelContext, PanelRenderProps } from "../types";
import { useEmbeddedPanel } from "../useEmbeddedPanel";
import type {
  RaidFrameCast,
  RaidFrameHeal,
  RaidFrameResourceSample,
  RaidFramesEncounter,
  RaidFramesResult,
} from "./raidFrames.processor";
import { POWER_COLORS, percent, useDisplayTimestamp } from "./raidFrameShared";

const UNIT_AURAS_PANEL = createUnitAurasPanel();

const ROLE_LABELS = { tank: "TANK", healer: "HEAL", dps: "DPS" } as const;
// A health drop of at least this share of maximum health between samples is marked on the health graph.
const SPIKE_SHARE = 0.2;

function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}

function ValueBar({
  color,
  current,
  max,
  right,
  absorb = 0,
  incoming = 0,
  className,
}: {
  color: string;
  current: number;
  max: number;
  right: string;
  absorb?: number;
  incoming?: number;
  className: string;
}) {
  const fill = percent(current, max);
  const shield = Math.min(percent(absorb, max), 100 - fill);
  const heals = Math.min(percent(incoming, max), 100 - fill - shield);
  return (
    <div className={cn("relative overflow-hidden rounded-sm bg-[#141414]", className)}>
      <div className="absolute inset-y-0 left-0 transition-[width] duration-100" style={{ width: `${fill}%`, background: color }} />
      {shield > 0 && <div className="absolute inset-y-0 bg-white/50" style={{ left: `${fill}%`, width: `${shield}%` }} />}
      {heals > 0 && <div className="absolute inset-y-0 bg-green-300/35" style={{ left: `${fill + shield}%`, width: `${heals}%` }} />}
      <div className="relative flex h-full items-center justify-between px-2 font-mono tabular-nums text-white [text-shadow:0_1px_2px_#000]">
        <span>
          {current.toLocaleString()} / {max.toLocaleString()}
          {absorb > 0 && <span className="text-white/80"> +{absorb.toLocaleString()}</span>}
        </span>
        <span>{right}</span>
      </div>
    </div>
  );
}

function CastRow({ cast, timestampMs }: { cast: RaidFrameCast | null; timestampMs: number }) {
  const displayMs = useDisplayTimestamp(timestampMs);
  const durationMs = cast ? Math.max(1, cast.endMs - cast.startMs) : 1;
  const progress = cast ? percent(Math.min(durationMs, Math.max(0, displayMs - cast.startMs)), durationMs) : 0;
  return (
    <div className="flex h-[30px] items-center gap-2 rounded border border-border bg-popover pl-1 pr-2">
      {cast ? (
        <SpellIdTooltip spellId={cast.spellId} name="" size={22} loadOnHover className="shrink-0" />
      ) : (
        <div className="size-[22px] shrink-0 rounded-sm bg-[#141414]" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex min-w-0 justify-between gap-2 text-[11px]">
          <span className={cn("truncate", cast ? "text-amber-200" : "text-muted-foreground")}>
            {cast ? `${cast.channel ? "Channeling" : "Casting"} ${cast.spellName}` : "Not casting"}
          </span>
          {cast && (
            <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
              {(Math.max(0, cast.endMs - displayMs) / 1000).toFixed(1)}s
            </span>
          )}
        </div>
        <div className="h-[3px] overflow-hidden rounded-sm bg-[#141414]">
          <div className="h-full bg-amber-400" style={{ width: `${cast?.channel ? 100 - progress : progress}%` }} />
        </div>
      </div>
    </div>
  );
}

/** The unit's health over the encounter as a step line, with big drops marked and the Sync cursor. */
function HealthGraph({
  samples,
  encounter,
  color,
  cursorMs,
}: {
  samples: readonly RaidFrameResourceSample[];
  encounter: RaidFramesEncounter;
  color: string;
  cursorMs: number | null;
}) {
  const spanMs = Math.max(1, encounter.endMs - encounter.startMs);
  const graph = useMemo(() => {
    const x = (ms: number) => ((ms - encounter.startMs) / spanMs) * 300;
    const y = (share: number) => 62 - share * 58;
    let line = "";
    let lowest = 1;
    const spikes: { left: number; title: string }[] = [];
    let previous: RaidFrameResourceSample | null = null;
    for (const sample of samples) {
      if (sample.maximumHealth <= 0) continue;
      const share = sample.currentHealth / sample.maximumHealth;
      lowest = Math.min(lowest, share);
      line += line ? ` H${x(sample.timestampMs).toFixed(1)} V${y(share).toFixed(1)}` : `M0 ${y(share).toFixed(1)}`;
      const drop = previous ? previous.currentHealth - sample.currentHealth : 0;
      if (drop >= SPIKE_SHARE * sample.maximumHealth) {
        const atMs = sample.timestampMs - encounter.startMs;
        spikes.push({
          left: (atMs / spanMs) * 100,
          title: `${formatClock(atMs)} −${drop.toLocaleString()}${sample.currentHealth === 0 ? " (died)" : ""}`,
        });
      }
      previous = sample;
    }
    if (line) line += " H300";
    return { line, area: line ? `${line} V64 H0 Z` : "", lowest, spikes };
  }, [samples, encounter.startMs, spanMs]);

  const cursorShare = cursorMs === null ? null : percent(cursorMs - encounter.startMs, spanMs);
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>
        <span>Health over fight</span>
        {graph.line && <span className="font-mono tracking-normal">low {Math.round(graph.lowest * 100)}%</span>}
      </SectionLabel>
      <div className="relative h-9 overflow-hidden rounded-sm bg-[#1d1d1d]">
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/[.08]" />
        <svg viewBox="0 0 300 64" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <path d={graph.area} fill={color} fillOpacity={0.18} />
          <path d={graph.line} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        </svg>
        {graph.spikes.map((spike, index) => (
          <div key={index} title={spike.title} className="absolute inset-y-0 w-px bg-destructive/70" style={{ left: `${spike.left}%` }} />
        ))}
        {cursorShare !== null && <div className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${cursorShare}%` }} />}
        <div className="pointer-events-none absolute inset-x-1 bottom-0.5 flex justify-between font-mono text-[9px] text-muted-foreground">
          <span>0:00</span>
          {cursorMs !== null && <span>{formatClock(cursorMs - encounter.startMs)}</span>}
          <span>{formatClock(spanMs)}</span>
        </div>
      </div>
    </div>
  );
}

export interface PlayerDetailProps {
  guid: string;
  props: PanelRenderProps<RaidFramesResult>;
  encounter: RaidFramesEncounter;
  timestampMs: number;
  sample: RaidFrameResourceSample | null;
  cast: RaidFrameCast | null;
  incomingHeals: readonly RaidFrameHeal[];
  /** The raid frames' players in frame order, for previous / next. */
  playerOrder: readonly string[];
  onSelect: (guid: string | null) => void;
}

/**
 * One player up close (Raid Frames with a single `u:<guid>`): health, power
 * and cast now, health over the fight, and auras from the Unit Auras panel
 * (so they match it exactly).
 */
export function PlayerDetail({
  guid,
  props,
  encounter,
  timestampMs,
  sample,
  cast,
  incomingHeals,
  playerOrder,
  onSelect,
}: PlayerDetailProps) {
  const { context, durationMs, result } = props;
  const sync = useSyncModeContextOptional();

  const player = context.instance.players?.[guid];
  const name = player?.name ?? context.instance.units?.[guid]?.name ?? guid;
  const color = player ? getClassColorVar(player.class) : "var(--color-class-enemy)";
  const specialization = usePlayerSpecializations().get(guid);
  const group = result.composition.groups.findIndex((members) => members.includes(guid));

  // Role inference spans the whole raid, independent of entity selection.
  const encounterIdsKey = context.selectedEncounterIds.join(",");
  const raidContext = useMemo<PanelContext>(() => ({
    instance: context.instance,
    selectedEncounterIds: context.selectedEncounterIds,
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [context.instance, encounterIdsKey]);

  const inferred = useInferredRoles(raidContext);
  const role = inferred.roles.get(guid)?.role;

  const auras = useEmbeddedPanel({ panel: UNIT_AURAS_PANEL, context: raidContext, durationMs });

  const dead = sample?.currentHealth === 0 && (sample?.maximumHealth ?? 0) > 0;
  const pendingHeal = dead ? 0 : incomingHeals.reduce((total, heal) => total + heal.amount, 0);
  const powerType = sample?.powerType ?? "";

  const orderIndex = playerOrder.indexOf(guid);
  const step = (delta: number) => {
    if (playerOrder.length === 0) return;
    onSelect(playerOrder[(Math.max(0, orderIndex) + delta + playerOrder.length) % playerOrder.length]);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2">
        <img
          src={specialization?.iconUrl ?? `/c/icons/class_${(player?.class ?? "unknown").toLowerCase()}.png`}
          alt=""
          className="size-[30px] shrink-0 rounded-[3px] bg-[#141414] object-cover"
          style={{ boxShadow: `0 0 0 1px #000, 0 0 0 2px ${color}` }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold" style={{ color }}>{dead ? `☠ ${name}` : name}</span>
            {role && (
              <span className="shrink-0 rounded-sm border border-border px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground">
                {ROLE_LABELS[role]}
              </span>
            )}
          </div>
          <span className="truncate text-[11px] text-muted-foreground">
            {[
              player && [`Level ${player.level}`, specialization?.name, CLASS_DISPLAY[player.class] ?? player.class].filter(Boolean).join(" "),
              group >= 0 && `Group ${group + 1}`,
            ].filter(Boolean).join(" · ")}
          </span>
          <span className={cn("truncate text-[10px]", pendingHeal > 0 ? "text-green-300" : "text-muted-foreground")}>
            {pendingHeal > 0 ? `+${pendingHeal.toLocaleString()} incoming heals` : "No incoming heals"}
          </span>
        </div>
        <div className="flex shrink-0 gap-0.5">
          {[
            { label: "Previous player", icon: <ChevronLeft className="size-3.5" />, onClick: () => step(-1) },
            { label: "Next player", icon: <ChevronRight className="size-3.5" />, onClick: () => step(1) },
            { label: "Back to raid frames", icon: <X className="size-3.5" />, onClick: () => onSelect(null) },
          ].map((button) => (
            <button
              key={button.label}
              type="button"
              title={button.label}
              aria-label={button.label}
              onClick={button.onClick}
              className="flex size-6 items-center justify-center rounded border border-border bg-popover text-muted-foreground hover:text-foreground"
            >
              {button.icon}
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex shrink-0 flex-col gap-1.5 px-3 py-2", dead && "opacity-60")}>
        <div className="flex flex-col gap-1">
          {sample && sample.maximumHealth > 0 ? (
            <ValueBar
              color={color}
              current={sample.currentHealth}
              max={sample.maximumHealth}
              absorb={sample.absorb}
              incoming={pendingHeal}
              right={`${Math.round(percent(sample.currentHealth, sample.maximumHealth))}%`}
              className="h-[18px] text-[11px]"
            />
          ) : (
            <div className="text-2xs text-muted-foreground">No health data yet</div>
          )}
          {sample && sample.maximumPower > 0 && (
            <ValueBar
              color={POWER_COLORS[powerType] ?? "#767676"}
              current={sample.currentPower}
              max={sample.maximumPower}
              right={powerType}
              className="h-3 text-[9px]"
            />
          )}
        </div>
        <CastRow cast={dead ? null : cast} timestampMs={timestampMs} />
      </div>

      <div className="styled-scrollbar min-h-0 flex-1 overflow-auto border-t border-border">
        <div className="flex flex-col gap-2 px-3 py-2">
          <HealthGraph
            samples={encounter.resourcesByUnit.get(guid) ?? []}
            encounter={encounter}
            color={color}
            cursorMs={sync?.enabled ? timestampMs : null}
          />
          <div className="flex flex-col gap-1.5">
            <SectionLabel><span>Auras</span></SectionLabel>
            {auras(`u:${guid}`)}
          </div>
        </div>
      </div>
    </div>
  );
}
