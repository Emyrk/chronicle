import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import { SpellIdTooltip } from "@/components/ui/SpellIdTooltip";
import { usePlayerSpecializations } from "@/components/ui/PlayerMetricChart/PlayerSpecializationContext";
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { cn } from "@/lib/utils";
import {
  materializeActiveUnitAuras,
  type UnitAuraEntry,
  type UnitAuraSegment,
  type UnitAurasResult,
} from "./unitAuras.processor";
import {
  compactAuraColors,
  compactAuraKind,
  compactAuraPercent,
  formatCompactAuraPercent,
} from "./compactAura";
import { mergeAdjacentAuraSegments, summarizeAuraSources, uniqueAuraAppliers } from "./sourceSummary";
import { parseSelectedUnits, serializeSelectedUnits } from "./unitSelection";
import { UnitIcon } from "./UnitIcon";
import { UnitSearch, type UnitSearchOption } from "./UnitSearch";

interface DisplaySegment extends UnitAuraSegment {
  displayStartMs: number;
  displayEndMs: number;
}

interface AuraRow extends Omit<UnitAuraEntry, "segments"> {
  segments: DisplaySegment[];
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
            <TooltipContent side="top" hideArrow className="text-xs">
              <div className="font-medium">{name}</div>
              <div className="text-muted-foreground">
                {formatTime(segment.startMs)}–{formatTime(segment.endMs)}
              </div>
              {encounterNames.get(segment.encounterId) && (
                <div className="max-w-48 truncate text-muted-foreground/70">
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
}: {
  row: AuraRow;
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
}) {
  const percent = compactAuraPercent(row.totalUptimeMs, durationMs);
  const colors = compactAuraColors(percent);
  const appliers = uniqueAuraAppliers(row.segments).map((source) => ({
    guid: source.guid,
    name: resolveSourceName(source.guid, source.name, players, units),
  }));
  const tooltipHeader = (
    <div className="rounded-t border border-b-0 border-zinc-700 bg-[#1a1a2e] px-3 py-2 text-xs text-zinc-200">
      <div className="mb-1 font-semibold text-zinc-400">Applied by</div>
      <div className="space-y-0.5">
        {appliers.length > 0 ? appliers.map((applier) => (
          <div key={applier.guid}>{applier.name}</div>
        )) : (
          <div>Unknown</div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="group relative size-12 shrink-0 rounded-[10px] p-[3px] transition-transform hover:z-10 hover:scale-105"
      style={{
        background: `conic-gradient(${colors.ring} ${percent * 3.6}deg, rgba(82, 82, 82, 0.5) 0deg)`,
      }}
      title={`${row.spellName} · ${compactAuraKind(row.isBuff)} · ${formatPercent(row.totalUptimeMs, durationMs)} uptime`}
    >
      <div
        className="relative flex size-full items-center justify-center overflow-hidden rounded-[7px] border border-black/30 shadow-inner"
        style={{ backgroundColor: colors.surface }}
      >
        <Sparkles className="absolute size-4 text-foreground/50" />
        <SpellIdTooltip
          spellId={row.spellId}
          name={row.spellName}
          size={40}
          tooltipHeader={tooltipHeader}
          className={cn(
            "relative z-10 flex size-full items-center justify-center overflow-hidden text-[0px]",
            "[&_img]:size-full [&_img]:rounded-[6px] [&_img]:border-0 [&_img]:object-cover",
            "[&>span]:flex [&>span]:size-full [&>span]:items-center [&>span]:justify-center [&>span]:text-[0px]",
          )}
        />
      </div>
      {!row.isBuff && (
        <span
          aria-label="Debuff"
          className="absolute -left-1 -top-1 z-20 size-3 rounded-full border-2 border-card bg-rose-500 shadow-sm"
        />
      )}
      <span
        className="absolute -bottom-1 -right-1 z-20 rounded-[3px] px-1 py-0.5 font-mono text-[9px] font-bold leading-none text-slate-950 tabular-nums shadow-sm"
        style={{ backgroundColor: colors.badge }}
      >
        {formatCompactAuraPercent(percent)}%
      </span>
    </div>
  );
}

function CompactAuraGrid({
  rows,
  durationMs,
  players,
  units,
}: {
  rows: AuraRow[];
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
}) {
  return (
    <div className="flex flex-wrap content-start gap-3 p-3">
      {rows.map((row) => (
        <CompactAuraTile
          key={row.auraKey}
          row={row}
          durationMs={durationMs}
          players={players}
          units={units}
        />
      ))}
    </div>
  );
}

function AuraSection({
  title,
  rows,
  durationMs,
  players,
  units,
  encounterNames,
}: {
  title: "Buffs" | "Debuffs";
  rows: AuraRow[];
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
  encounterNames: ReadonlyMap<string, string>;
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
          <div key={row.auraKey} className="px-2.5 py-2 transition-colors hover:bg-muted/20">
            <div className="mb-1.5 flex items-center gap-2">
              <SpellIdTooltip
                spellId={row.spellId}
                name={row.spellName}
                size={24}
                className="min-w-0 flex-1 truncate text-xs font-medium"
              />
              <div className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatPercent(row.totalUptimeMs, durationMs)}
              </div>
            </div>
            <AuraTimeline
              segments={row.segments}
              durationMs={durationMs}
              players={players}
              units={units}
              encounterNames={encounterNames}
            />
            <SourceSummary segments={row.segments} players={players} units={units} />
          </div>
        ))}
      </div>
    </section>
  );
}

function buildUnitAuraRows(
  unitGuid: string,
  byUnit: ReadonlyMap<string, { auras: Map<string, UnitAuraEntry> }>,
  encounterOffsets: ReadonlyMap<string, number>,
): { buffs: AuraRow[]; debuffs: AuraRow[] } {
  const unit = byUnit.get(unitGuid);
  if (!unit) return { buffs: [], debuffs: [] };

  const mapped = [...unit.auras.values()].map((aura): AuraRow => ({
    ...aura,
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

  const byUptime = (a: AuraRow, b: AuraRow) => (
    b.totalUptimeMs - a.totalUptimeMs || a.spellName.localeCompare(b.spellName)
  );
  return {
    buffs: mapped.filter((aura) => aura.isBuff).sort(byUptime),
    debuffs: mapped.filter((aura) => !aura.isBuff).sort(byUptime),
  };
}

export function UnitAurasContent(props: PanelRenderProps<UnitAurasResult>) {
  const { context, durationMs, panelOption, setPanelOption, result, checkboxChecked } = props;
  const selectedGuids = useMemo(() => parseSelectedUnits(panelOption), [panelOption]);
  const selectedGuidSet = useMemo(() => new Set(selectedGuids), [selectedGuids]);
  const [activeTabGuid, setActiveTabGuid] = useState<string | null>(null);
  const playerSpecializations = usePlayerSpecializations();

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

  const byUnit = useMemo(
    () => materializeActiveUnitAuras(result, encounterEndOffsets),
    [encounterEndOffsets, result],
  );

  const searchUnits = useMemo<UnitSearchOption[]>(() => [...byUnit.values()]
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
      byUnit,
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
  const rowsByUnit = useMemo(() => new Map(
    selectedUnits.map((unit) => [unit.guid, buildUnitAuraRows(unit.guid, byUnit, encounterOffsets)]),
  ), [byUnit, encounterOffsets, selectedUnits]);
  const detailedUnit = selectedUnits.find((unit) => unit.guid === activeTabGuid) ?? selectedUnits[0] ?? null;
  const detailedRows = detailedUnit ? rowsByUnit.get(detailedUnit.guid) : null;

  const toggleUnit = (guid: string) => {
    const next = selectedGuidSet.has(guid)
      ? selectedGuids.filter((selectedGuid) => selectedGuid !== guid)
      : [...selectedGuids, guid];
    setPanelOption?.(serializeSelectedUnits(next));
    if (!selectedGuidSet.has(guid)) setActiveTabGuid(guid);
  };

  return (
    <GenericPanel {...props}>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <UnitSearch
          units={searchUnits}
          selectedGuids={selectedGuidSet}
          onToggle={toggleUnit}
          onClear={() => setPanelOption?.(null)}
        />

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
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold">{unit.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {rows.buffs.length} buffs · {rows.debuffs.length} debuffs
                      </span>
                    </div>
                    <CompactAuraGrid
                      rows={[...rows.buffs, ...rows.debuffs]}
                      durationMs={durationMs}
                      players={context.instance.players}
                      units={context.instance.units}
                    />
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
                  <span className="max-w-32 truncate">{unit.name}</span>
                </button>
              ))}
            </div>
            <ScrollArea className="min-h-0 flex-1 rounded border border-border/70 bg-background/25">
              <div className="min-w-0">
                <AuraSection
                  title="Buffs"
                  rows={detailedRows.buffs}
                  durationMs={durationMs}
                  players={context.instance.players}
                  units={context.instance.units}
                  encounterNames={encounterNames}
                />
                <AuraSection
                  title="Debuffs"
                  rows={detailedRows.debuffs}
                  durationMs={durationMs}
                  players={context.instance.players}
                  units={context.instance.units}
                  encounterNames={encounterNames}
                />
              </div>
            </ScrollArea>
          </div>
        ) : null}
      </div>
    </GenericPanel>
  );
}
