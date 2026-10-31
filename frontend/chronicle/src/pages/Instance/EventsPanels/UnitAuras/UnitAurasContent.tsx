import { useMemo, useState, type ReactNode } from "react";
import { Search, Sparkles, X } from "lucide-react";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import { HintTooltip, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { getClassColorVar } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { instanceEntityAttributes } from "@/components/ui/PlayerMetricChart/instanceEntity";
import {
  materializeActiveUnitAuras,
  materializeCurrentUnitAuras,
  type ReplayUnitAuraState,
  type UnitAuraEntry,
  type UnitAuraSegment,
  type UnitAurasResult,
  unitAuraUptimeDurationMs,
} from "./unitAuras.processor";
import {
  compactAuraColors,
  compactAuraPercent,
  formatCompactAuraPercent,
} from "./compactAura";
import { fuzzyAuraNameMatch } from "./auraSearchMatch";
import { mergeAdjacentAuraSegments, summarizeAuraSources, uniqueAuraAppliers } from "./sourceSummary";
import {
  parseAuraSearchQuery,
  parseSelectedUnits,
  serializeUnitAuraOptions,
} from "./unitSelection";
import { UnitIcon } from "./UnitIcon";
import { UnitSearch, type UnitSearchOption } from "./UnitSearch";

interface DisplaySegment extends UnitAuraSegment {
  displayStartMs: number;
  displayEndMs: number;
}

interface AuraRow extends Omit<UnitAuraEntry, "segments"> {
  segments: DisplaySegment[];
  replayState: ReplayUnitAuraState | null;
  remainingMs: number | null;
  startsInMs: number | null;
  countdownTotalMs: number | null;
}

const SOURCE_COLORS = [
  "#60a5fa",
  "#c084fc",
  "#f472b6",
  "#34d399",
  "#f59e0b",
  "#22d3ee",
  "#a3e635",
  "#fb7185",
];

function sourceColor(guid: string | null): string {
  if (!guid) return "#737373";
  let hash = 0;
  for (let index = 0; index < guid.length; index++) {
    hash = ((hash << 5) - hash + guid.charCodeAt(index)) | 0;
  }
  return SOURCE_COLORS[Math.abs(hash) % SOURCE_COLORS.length];
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function formatPercent(uptimeMs: number, durationMs: number): string {
  if (durationMs <= 0) return "0%";
  const percent = Math.min(100, (uptimeMs / durationMs) * 100);
  return percent >= 10 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`;
}

function resolveSourceName(
  sourceGuid: string | null,
  sourceName: string | null,
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"],
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"],
): string {
  if (!sourceGuid) return "Unknown";
  if (sourceName === "Self") return "Self";
  return players?.[sourceGuid]?.name
    ?? units?.[sourceGuid]?.name
    ?? sourceName
    ?? sourceGuid;
}

function AuraTimeline({
  segments,
  durationMs,
  players,
  units,
  encounterNames,
}: {
  segments: DisplaySegment[];
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
  encounterNames: ReadonlyMap<string, string>;
}) {
  if (durationMs <= 0) return null;

  return (
    <div className="relative h-2.5 overflow-hidden rounded-sm bg-foreground/15">
      {segments.map((segment, index) => {
        const left = (segment.displayStartMs / durationMs) * 100;
        const width = ((segment.displayEndMs - segment.displayStartMs) / durationMs) * 100;
        if (width <= 0) return null;
        const name = resolveSourceName(segment.sourceGuid, segment.sourceName, players, units);
        return (
          <HintTooltip key={`${segment.encounterId}-${segment.startMs}-${index}`} delayDuration={50}>
            <TooltipTrigger asChild>
              <div
                className="absolute inset-y-0 cursor-default transition-[filter] hover:z-10 hover:brightness-125"
                style={{
                  left: `${Math.max(0, Math.min(100, left))}%`,
                  width: `${Math.max(0.35, Math.min(width, 100 - left))}%`,
                  backgroundColor: sourceColor(segment.sourceGuid),
                }}
              />
            </TooltipTrigger>
            <TooltipContent
              side="top"
              hideArrow
              className="border border-zinc-700 bg-[#111118] text-xs text-zinc-100 shadow-xl"
            >
              <div className="font-medium text-zinc-100">{name}</div>
              <div className="text-zinc-400">
                {formatTime(segment.startMs)}–{formatTime(segment.endMs)}
              </div>
              {encounterNames.get(segment.encounterId) && (
                <div className="max-w-48 truncate text-zinc-500">
                  {encounterNames.get(segment.encounterId)}
                </div>
              )}
            </TooltipContent>
          </HintTooltip>
        );
      })}
    </div>
  );
}

function SourceSummary({
  segments,
  players,
  units,
}: {
  segments: DisplaySegment[];
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
}) {
  const sources = summarizeAuraSources(segments);
  const visible = sources.slice(0, 3);
  const hiddenCount = sources.length - visible.length;

  return (
    <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-[10px] leading-none text-muted-foreground">
      {visible.map((source) => (
        <span key={source.guid ?? "unknown"} className="inline-flex min-w-0 shrink items-center gap-1">
          <span className="size-1.5 shrink-0 rounded-[2px]" style={{ backgroundColor: sourceColor(source.guid) }} />
          <span className="max-w-24 truncate text-foreground/70">
            {resolveSourceName(source.guid, source.name, players, units)}
          </span>
          <span className="shrink-0 tabular-nums">{formatDuration(source.uptimeMs)}</span>
        </span>
      ))}
      {hiddenCount > 0 && <span className="shrink-0">+{hiddenCount} sources</span>}
    </div>
  );
}

function CompactAuraTile({
  row,
  durationMs,
  players,
  units,
  realm,
  showUptime,
  dense = false,
  large = false,
}: {
  row: AuraRow;
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
  /** The log's realm, so applier names are Alt+clickable. */
  realm?: string;
  showUptime: boolean;
  /** Overlay size (map inspect cards): a small icon tile. */
  dense?: boolean;
  /** With dense: a somewhat larger tile (raid frames' player detail). */
  large?: boolean;
}) {
  const percent = compactAuraPercent(row.totalUptimeMs, durationMs);
  const colors = compactAuraColors(percent);
  const fullUptimeColors = compactAuraColors(100);
  const countdownMs = row.replayState === "upcoming" ? row.startsInMs : row.remainingMs;
  const countdownPercent = countdownMs !== null && row.countdownTotalMs
    ? compactAuraPercent(countdownMs, row.countdownTotalMs)
    : 100;
  const replayRingColor = row.replayState === "upcoming" ? "#71717a" : fullUptimeColors.ring;
  const appliers = uniqueAuraAppliers(row.segments).map((source) => ({
    guid: source.guid,
    name: resolveSourceName(source.guid, source.name, players, units),
    className: players?.[source.guid]?.class,
  }));
  const tooltipFooter = appliers.length > 0 ? (
    <div className="mt-2 border-t border-zinc-700 pt-2 text-xs text-zinc-200">
      <div className="mb-1 font-semibold text-zinc-400">Applied by</div>
      <div className="space-y-0.5">
        {appliers.map((applier) => (
          <div
            key={applier.guid}
            style={applier.className ? { color: getClassColorVar(applier.className) } : undefined}
            {...instanceEntityAttributes({ players, realm }, applier.guid)}
          >
            {applier.name}
          </div>
        ))}
      </div>
    </div>
  ) : undefined;

  return (
    <div
      className={cn(
        "group pointer-events-auto relative shrink-0 transition-transform hover:z-10 hover:scale-105",
        dense ? cn(large ? "size-7" : "size-5", "rounded-[4px] p-px") : "size-12 rounded-[10px] p-[3px]",
        !showUptime && row.replayState === "active" && "animate-replay-pop",
      )}
      style={{
        background: showUptime
          ? `conic-gradient(${colors.ring} ${percent * 3.6}deg, rgba(82, 82, 82, 0.5) 0deg)`
          : `conic-gradient(${replayRingColor} ${countdownPercent * 3.6}deg, rgba(82, 82, 82, 0.35) 0deg)`,
      }}
    >
      <div
        className={cn("relative flex size-full items-center justify-center overflow-hidden border border-black/30 shadow-inner", dense ? "rounded-[3px]" : "rounded-[7px]")}
        style={{
          backgroundColor: showUptime
            ? colors.surface
            : row.replayState === "upcoming"
              ? "rgb(39 39 42 / 0.88)"
              : fullUptimeColors.surface,
        }}
      >
        <Sparkles className={cn("absolute text-foreground/50", dense ? "size-2.5" : "size-4")} />
        <SpellIdTooltip
          spellId={row.spellId}
          name={row.spellName}
          size={dense ? (large ? 26 : 18) : 40}
          tooltipFooter={tooltipFooter}
          className={cn(
            "relative z-10 flex size-full items-center justify-center overflow-hidden text-[0px]",
            "[&_img]:size-full [&_img]:rounded-[6px] [&_img]:border-0 [&_img]:object-cover",
            row.replayState === "upcoming" && "[&_img]:grayscale [&_img]:opacity-45",
            "[&>span]:flex [&>span]:size-full [&>span]:items-center [&>span]:justify-center [&>span]:text-[0px]",
          )}
        />
      </div>
      {!row.isBuff && (
        <span
          aria-label="Debuff"
          className={cn("absolute z-20 rounded-full border-card bg-rose-500 shadow-sm", dense ? cn("-left-px -top-px", large ? "size-2" : "size-1.5") : "-left-1 -top-1 size-3 border-2")}
        />
      )}
      {(showUptime || countdownMs !== null) && (
        <span
          className={cn(
            "absolute z-20 rounded-[3px] font-mono font-bold leading-none tabular-nums shadow-sm",
            dense ? cn("-bottom-1 -right-1.5 px-px py-px", large ? "text-[8px]" : "text-[6px]") : "-bottom-1 -right-1 px-1 py-0.5 text-[9px]",
            showUptime ? "text-slate-950" : "bg-zinc-950/90 text-zinc-100",
          )}
          style={showUptime ? { backgroundColor: colors.badge } : undefined}
        >
          {showUptime
            ? `${formatCompactAuraPercent(percent)}%`
            : `${row.replayState === "upcoming" ? "in " : ""}${formatRemaining(countdownMs!)}`}
        </span>
      )}
    </div>
  );
}

function CompactAuraGrid({
  rows,
  durationMs,
  players,
  units,
  realm,
  showUptime,
  dense = false,
  large = false,
  leading,
}: {
  rows: AuraRow[];
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
  realm?: string;
  showUptime: boolean;
  dense?: boolean;
  large?: boolean;
  /** Drawn before the tiles, in the same wrapping row. */
  leading?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap content-start", dense ? "gap-1" : "gap-3 p-3")}>
      {leading}
      {rows.map((row) => (
        <CompactAuraTile
          key={`${row.auraKey}:${row.replayState ?? "recorded"}`}
          row={row}
          durationMs={durationMs}
          players={players}
          units={units}
          realm={realm}
          showUptime={showUptime}
          dense={dense}
          large={large}
        />
      ))}
    </div>
  );
}

/** Render-only panel option token: larger overlay icons. */
export const LARGE_ICONS_OPTION = "lg";

/** Share of a unit's fight a buff must cover to count as a whole-fight buff. */
const WHOLE_FIGHT_UPTIME = 0.95;

// Whole-fight buffs as one small "+N" tile; hovering lists them.
function WholeFightBuffsTile({ rows, large = false }: { rows: AuraRow[]; large?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn("pointer-events-auto grid shrink-0 cursor-default place-items-center rounded-[4px] border border-emerald-400/60 bg-emerald-900/60 font-mono font-bold leading-none text-emerald-100", large ? "size-7 text-[11px]" : "size-5 text-[9px]")}
          aria-label={`${rows.length} whole-fight buffs`}
        >
          +{rows.length}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-64 px-2.5 py-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Whole-fight buffs</div>
        <div className="flex flex-col gap-1">
          {rows.map((row) => (
            <div key={row.auraKey} className="text-xs text-zinc-100">
              <SpellIdTooltip spellId={row.spellId} name={row.spellName} size={16} />
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function activeAurasBeforeUpcoming(rows: AuraRow[]): AuraRow[] {
  const upcoming = rows
    .filter((row) => row.replayState === "upcoming")
    .sort((a, b) => (
      (a.startsInMs ?? Number.POSITIVE_INFINITY) - (b.startsInMs ?? Number.POSITIVE_INFINITY)
      || a.spellName.localeCompare(b.spellName)
    ));
  return [
    ...rows.filter((row) => row.replayState !== "upcoming"),
    ...upcoming,
  ];
}

function AuraSection({
  title,
  rows,
  uptimeDurationMs,
  timelineDurationMs,
  players,
  units,
  encounterNames,
  showUptime,
}: {
  title: "Buffs" | "Debuffs";
  rows: AuraRow[];
  uptimeDurationMs: number;
  timelineDurationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
  encounterNames: ReadonlyMap<string, string>;
  showUptime: boolean;
}) {
  const buffs = title === "Buffs";
  if (rows.length === 0) return null;

  return (
    <section>
      <div className={cn(
        "sticky top-0 z-10 flex items-center gap-1.5 border-y border-border/60 bg-card/95 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm",
        buffs ? "text-sky-400" : "text-rose-400",
      )}>
        <span>{title}</span>
        <span className="font-mono font-normal tracking-normal text-muted-foreground">{rows.length}</span>
      </div>
      <div className="divide-y divide-border/45">
        {rows.map((row) => (
          <div
            key={`${row.auraKey}:${row.replayState ?? "recorded"}`}
            className={cn(
              "px-2.5 py-2 transition-colors hover:bg-muted/20",
              !showUptime && row.replayState === "active" && "animate-replay-pop",
              row.replayState === "upcoming" && "bg-zinc-500/5 text-muted-foreground opacity-60 grayscale",
            )}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <SpellIdTooltip
                spellId={row.spellId}
                name={row.spellName}
                size={24}
                className="min-w-0 flex-1 truncate text-xs font-medium"
              />
              {(showUptime || row.remainingMs !== null || row.startsInMs !== null) && (
                <div className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {showUptime
                    ? formatPercent(row.totalUptimeMs, uptimeDurationMs)
                    : row.replayState === "upcoming"
                      ? `active in ${formatRemaining(row.startsInMs!)}`
                      : `${formatRemaining(row.remainingMs!)} remaining`}
                </div>
              )}
            </div>
            {showUptime && (
              <>
                <AuraTimeline
                  segments={row.segments}
                  durationMs={timelineDurationMs}
                  players={players}
                  units={units}
                  encounterNames={encounterNames}
                />
                <SourceSummary segments={row.segments} players={players} units={units} />
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function buildUnitAuraRows(
  unitGuid: string,
  byUnit: ReadonlyMap<string, {
    auras: ReadonlyMap<string, UnitAuraEntry & {
      replayState?: ReplayUnitAuraState;
      remainingMs?: number | null;
      startsInMs?: number | null;
      countdownTotalMs?: number | null;
    }>;
  }>,
  encounterOffsets: ReadonlyMap<string, number>,
  auraSearchQuery: string,
): { buffs: AuraRow[]; debuffs: AuraRow[] } {
  const unit = byUnit.get(unitGuid);
  if (!unit) return { buffs: [], debuffs: [] };

  const mapped = [...unit.auras.values()]
    .filter((aura) => fuzzyAuraNameMatch(auraSearchQuery, aura.spellName))
    .map((aura): AuraRow => ({
      ...aura,
      replayState: aura.replayState ?? null,
      remainingMs: aura.remainingMs ?? null,
      startsInMs: aura.startsInMs ?? null,
      countdownTotalMs: aura.countdownTotalMs ?? null,
      segments: mergeAdjacentAuraSegments(
        [...aura.segments].sort((a, b) => {
          const aOffset = encounterOffsets.get(a.encounterId) ?? 0;
          const bOffset = encounterOffsets.get(b.encounterId) ?? 0;
          return aOffset + a.startMs - (bOffset + b.startMs);
        }),
      ).map((segment) => {
        const offset = encounterOffsets.get(segment.encounterId) ?? 0;
        return {
          ...segment,
          displayStartMs: offset + segment.startMs,
          displayEndMs: offset + segment.endMs,
        };
      }),
    }));

  const byUptime = (a: AuraRow, b: AuraRow) => {
    if (a.replayState !== b.replayState) {
      if (a.replayState === "active") return -1;
      if (b.replayState === "active") return 1;
    }
    if (a.replayState === "upcoming" && b.replayState === "upcoming") {
      return (a.startsInMs ?? 0) - (b.startsInMs ?? 0) || a.spellName.localeCompare(b.spellName);
    }
    return b.totalUptimeMs - a.totalUptimeMs || a.spellName.localeCompare(b.spellName);
  };
  return {
    buffs: mapped.filter((aura) => aura.isBuff).sort(byUptime),
    debuffs: mapped.filter((aura) => !aura.isBuff).sort(byUptime),
  };
}

export function UnitAurasContent(props: PanelRenderProps<UnitAurasResult>) {
  const { context, durationMs, panelOption, setPanelOption, result, checkboxChecked } = props;
  const selectedGuids = useMemo(() => parseSelectedUnits(panelOption), [panelOption]);
  const auraSearchQuery = useMemo(() => parseAuraSearchQuery(panelOption), [panelOption]);
  const selectedGuidSet = useMemo(() => new Set(selectedGuids), [selectedGuids]);
  const [activeTabGuid, setActiveTabGuid] = useState<string | null>(null);
  const playerSpecializations = usePlayerSpecializations();
  const syncMode = useSyncModeContextOptional();
  const showUptime = syncMode?.enabled !== true;
  const syncTimestamp = syncMode?.currentTimestamp ?? null;

  const encounterOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    let cumulative = 0;
    for (const encounter of context.instance.encounters) {
      if (!context.selectedEncounterIds.includes(encounter.id)) continue;
      offsets.set(encounter.id, cumulative);
      cumulative += new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime();
    }
    return offsets;
  }, [context.instance.encounters, context.selectedEncounterIds]);

  const encounterNames = useMemo(() => new Map(
    context.instance.encounters.map((encounter) => [encounter.id, encounter.name]),
  ), [context.instance.encounters]);

  const encounterEndOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    for (const encounter of context.instance.encounters) {
      if (!context.selectedEncounterIds.includes(encounter.id)) continue;
      offsets.set(encounter.id, new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime());
    }
    if (context.selectedEncounterIds.length === 1) {
      offsets.set(context.selectedEncounterIds[0], durationMs);
    }
    return offsets;
  }, [context.instance.encounters, context.selectedEncounterIds, durationMs]);

  const replayCursor = useMemo(() => {
    if (showUptime || !syncTimestamp) return null;
    const timestampMs = syncTimestamp.getTime();
    const selectedEncounters = context.instance.encounters.filter((encounter) => (
      context.selectedEncounterIds.includes(encounter.id)
    ));
    const encounter = selectedEncounters.find((candidate) => {
      const startMs = new Date(candidate.start_time).getTime();
      const endMs = new Date(candidate.end_time).getTime();
      return timestampMs >= startMs && timestampMs <= endMs;
    }) ?? selectedEncounters[0];
    if (!encounter) return null;

    const startMs = new Date(encounter.start_time).getTime();
    const endOffsetMs = new Date(encounter.end_time).getTime() - startMs;
    return {
      encounterId: encounter.id,
      offsetMs: Math.max(0, Math.min(endOffsetMs, timestampMs - startMs)),
      endOffsetMs,
    };
  }, [
    context.instance.encounters,
    context.selectedEncounterIds,
    showUptime,
    syncTimestamp,
  ]);

  const allByUnit = useMemo(
    () => materializeActiveUnitAuras(result, encounterEndOffsets),
    [encounterEndOffsets, result],
  );
  const byUnit = useMemo(
    () => showUptime
      ? allByUnit
      : replayCursor
        ? materializeCurrentUnitAuras(
            result,
            replayCursor.encounterId,
            replayCursor.offsetMs,
            replayCursor.endOffsetMs,
          )
        : new Map(),
    [allByUnit, replayCursor, result, showUptime],
  );

  const searchableByUnit = useMemo(
    () => showUptime ? allByUnit : new Map([...allByUnit, ...byUnit]),
    [allByUnit, byUnit, showUptime],
  );

  const searchUnits = useMemo<UnitSearchOption[]>(() => [...searchableByUnit.values()]
    .map((unit) => {
      const owner = context.instance.units?.[unit.guid]?.owner?.toString() ?? null;
      const playerGuid = context.instance.players?.[unit.guid]
        ? unit.guid
        : owner && context.instance.players?.[owner]
          ? owner
          : null;
      const player = playerGuid ? context.instance.players?.[playerGuid] : null;
      const specialization = playerGuid ? playerSpecializations.get(playerGuid) : null;
      return {
        guid: unit.guid,
        name: unit.name,
        relation: playerGuid ? "friendly" as const : "hostile" as const,
        group: context.instance.players?.[unit.guid]
          ? "player" as const
          : playerGuid
            ? "friendly" as const
            : "enemy" as const,
        className: player?.class,
        specializationIconUrl: specialization?.iconUrl,
      };
    }), [
      searchableByUnit,
      context.instance.players,
      context.instance.units,
      playerSpecializations,
    ]);

  const unitLookup = useMemo(
    () => new Map(searchUnits.map((unit) => [unit.guid, unit])),
    [searchUnits],
  );
  const selectedUnits = useMemo(
    () => selectedGuids.map((guid) => unitLookup.get(guid)).filter((unit): unit is UnitSearchOption => Boolean(unit)),
    [selectedGuids, unitLookup],
  );
  const uptimeDurationByUnit = useMemo(() => new Map(
    selectedUnits.map((unit) => [
      unit.guid,
      unitAuraUptimeDurationMs(result, unit.guid, encounterEndOffsets),
    ]),
  ), [encounterEndOffsets, result, selectedUnits]);
  const rowsByUnit = useMemo(() => new Map(
    selectedUnits.map((unit) => [
      unit.guid,
      buildUnitAuraRows(unit.guid, byUnit, encounterOffsets, auraSearchQuery),
    ]),
  ), [auraSearchQuery, byUnit, encounterOffsets, selectedUnits]);
  const detailedUnit = selectedUnits.find((unit) => unit.guid === activeTabGuid) ?? selectedUnits[0] ?? null;
  const detailedRows = detailedUnit ? rowsByUnit.get(detailedUnit.guid) : null;

  const emptyAuraMessage = auraSearchQuery
    ? `${showUptime ? "No auras" : "No active auras"} match “${auraSearchQuery}”`
    : showUptime
      ? "No recorded auras"
      : "No active auras";

  const toggleUnit = (guid: string) => {
    const next = selectedGuidSet.has(guid)
      ? selectedGuids.filter((selectedGuid) => selectedGuid !== guid)
      : [...selectedGuids, guid];
    setPanelOption?.(serializeUnitAuraOptions(next, auraSearchQuery));
    if (!selectedGuidSet.has(guid)) setActiveTabGuid(guid);
  };

  const setAuraSearchQuery = (query: string) => {
    setPanelOption?.(serializeUnitAuraOptions(selectedGuids, query));
  };

  if (props.variant === "overlay") {
    // Embedded (map inspect cards): just each listed unit's auras as small
    // icons, somewhat larger with the `lg` option.
    const large = (panelOption ?? "").split(",").includes(LARGE_ICONS_OPTION);
    return (
      <div className="flex flex-col gap-1.5">
        {selectedGuids.map((guid) => {
          const rows = rowsByUnit.get(guid);
          const all = rows ? activeAurasBeforeUpcoming([...rows.buffs, ...rows.debuffs]) : [];
          // Nothing up: draw nothing, the card needs no "no auras" line.
          if (all.length === 0) return null;
          // Buffs up for (nearly) the whole fight fold into one "+N" tile.
          const fightMs = unitAuraUptimeDurationMs(result, guid, encounterEndOffsets);
          const wholeFight = allByUnit.get(guid);
          const isWholeFight = (row: AuraRow) => row.isBuff && row.replayState !== "upcoming" && fightMs > 0
            && (wholeFight?.auras.get(row.auraKey)?.totalUptimeMs ?? 0) >= WHOLE_FIGHT_UPTIME * fightMs;
          const persistent = all.filter(isWholeFight);
          // Upcoming auras are left out: the card only shows what is up now.
          const rest = all.filter((row) => !isWholeFight(row) && row.replayState !== "upcoming");
          if (rest.length === 0 && persistent.length === 0) return null;
          return (
            <CompactAuraGrid
              key={guid}
              rows={rest}
              durationMs={uptimeDurationByUnit.get(guid) ?? durationMs}
              players={context.instance.players}
              units={context.instance.units}
              realm={context.instance.realm}
              showUptime={showUptime}
              dense
              large={large}
              leading={persistent.length > 0 ? <WholeFightBuffsTile rows={persistent} large={large} /> : undefined}
            />
          );
        })}
      </div>
    );
  }

  return (
    <GenericPanel {...props}>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <div className="grid shrink-0 grid-cols-2 gap-1.5">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Players / units
            </div>
            <UnitSearch
              units={searchUnits}
              instance={context.instance}
              selectedGuids={selectedGuidSet}
              onToggle={toggleUnit}
              onClear={() => setPanelOption?.(serializeUnitAuraOptions([], auraSearchQuery))}
            />
          </div>

          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Buffs / debuffs
            </div>
            <div className={cn(
              "group flex h-8 items-center gap-2 rounded border border-border/80 bg-background/70 px-2",
              "shadow-inner transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/25",
            )}>
              <Search className="size-4 shrink-0 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <input
                type="search"
                aria-label="Filter auras by name"
                placeholder="Search aura names…"
                value={auraSearchQuery}
                onChange={(event) => setAuraSearchQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
              />
              {auraSearchQuery && (
                <button
                  type="button"
                  aria-label="Clear aura name filter"
                  onClick={() => setAuraSearchQuery("")}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {selectedUnits.length === 0 ? (
          <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/10 px-6 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div className="text-sm font-medium">Choose units to inspect</div>
            <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Search friendly players, companions, or hostile creatures with recorded buffs or debuffs.
            </div>
          </div>
        ) : !checkboxChecked ? (
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded border border-border/70 bg-background/25 styled-scrollbar">
            <div className="min-w-0 divide-y divide-border/60">
              {selectedUnits.map((unit) => {
                const rows = rowsByUnit.get(unit.guid);
                if (!rows) return null;
                return (
                  <section key={unit.guid} className="min-w-0 py-1 first:pt-0 last:pb-0">
                    <div className="flex min-w-0 items-center gap-2 border-b border-border/40 bg-card/70 px-2.5 py-1.5">
                      <UnitIcon unit={unit} className="size-5" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold" {...instanceEntityAttributes(context.instance, unit.guid)}>{unit.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {rows.buffs.length} buffs · {rows.debuffs.length} debuffs
                      </span>
                    </div>
                    {rows.buffs.length + rows.debuffs.length > 0 ? (
                      <CompactAuraGrid
                        rows={activeAurasBeforeUpcoming([...rows.buffs, ...rows.debuffs])}
                        durationMs={uptimeDurationByUnit.get(unit.guid) ?? durationMs}
                        players={context.instance.players}
                        units={context.instance.units}
                        realm={context.instance.realm}
                        showUptime={showUptime}
                      />
                    ) : (
                      <div className="px-3 py-5 text-center text-xs text-muted-foreground">
                        {emptyAuraMessage}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        ) : detailedUnit && detailedRows ? (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5">
            <div className="flex shrink-0 gap-1 overflow-x-auto pb-0.5 styled-scrollbar">
              {selectedUnits.map((unit) => (
                <button
                  key={unit.guid}
                  type="button"
                  onClick={() => setActiveTabGuid(unit.guid)}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-xs transition-colors",
                    detailedUnit.guid === unit.guid
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/70 bg-muted/10 text-muted-foreground hover:bg-muted/30 hover:text-foreground",
                  )}
                >
                  <UnitIcon unit={unit} className="size-4" />
                  <span className="max-w-32 truncate" {...instanceEntityAttributes(context.instance, unit.guid)}>{unit.name}</span>
                </button>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1 rounded border border-border/70 bg-background/25">
              <div className="min-w-0">
                {detailedRows.buffs.length + detailedRows.debuffs.length > 0 ? (
                  <>
                    <AuraSection
                      title="Buffs"
                      rows={detailedRows.buffs}
                      uptimeDurationMs={uptimeDurationByUnit.get(detailedUnit.guid) ?? durationMs}
                      timelineDurationMs={durationMs}
                      players={context.instance.players}
                      units={context.instance.units}
                      encounterNames={encounterNames}
                      showUptime={showUptime}
                    />
                    <AuraSection
                      title="Debuffs"
                      rows={detailedRows.debuffs}
                      uptimeDurationMs={uptimeDurationByUnit.get(detailedUnit.guid) ?? durationMs}
                      timelineDurationMs={durationMs}
                      players={context.instance.players}
                      units={context.instance.units}
                      encounterNames={encounterNames}
                      showUptime={showUptime}
                    />
                  </>
                ) : (
                  <div className="px-3 py-8 text-center text-xs text-muted-foreground">
                    {emptyAuraMessage}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : null}
      </div>
    </GenericPanel>
  );
}
