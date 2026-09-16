import { useMemo } from "react";
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
import { mergeAdjacentAuraSegments, summarizeAuraSources } from "./sourceSummary";
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

function parseSelectedUnit(panelOption: string | null | undefined): string | null {
  const token = panelOption?.split(",").find((part) => part.startsWith("u:"));
  return token?.slice(2) || null;
}

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

function CompactAuraGrid({
  rows,
  durationMs,
}: {
  rows: AuraRow[];
  durationMs: number;
}) {
  return (
    <ScrollArea className="min-h-0 flex-1 rounded border border-border/70 bg-background/25">
      <div className="flex flex-wrap content-start gap-1.5 p-2">
        {rows.map((row) => (
          <div
            key={row.auraKey}
            className={cn(
              "rounded border bg-muted/15 px-1.5 py-1 transition-colors hover:bg-muted/30",
              row.isBuff ? "border-sky-500/20" : "border-rose-500/20",
            )}
          >
            {row.spellId !== null ? (
              <SpellIdTooltip
                spellId={row.spellId}
                name={formatPercent(row.totalUptimeMs, durationMs)}
                size={26}
                className="font-mono text-[10px] tabular-nums text-muted-foreground"
              />
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="flex size-[26px] items-center justify-center rounded border border-border bg-muted text-muted-foreground">
                  <Sparkles className="size-3.5" />
                </span>
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  {formatPercent(row.totalUptimeMs, durationMs)}
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
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

export function UnitAurasContent(props: PanelRenderProps<UnitAurasResult>) {
  const { context, durationMs, panelOption, setPanelOption, result, checkboxChecked } = props;
  const selectedGuid = parseSelectedUnit(panelOption);
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
        className: player?.class,
        specializationIconUrl: specialization?.iconUrl,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name)), [
      byUnit,
      context.instance.players,
      context.instance.units,
      playerSpecializations,
    ]);

  const rows = useMemo(() => {
    const unit = selectedGuid ? byUnit.get(selectedGuid) : null;
    if (!unit) return { buffs: [] as AuraRow[], debuffs: [] as AuraRow[] };

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

    const byUptime = (a: AuraRow, b: AuraRow) => b.totalUptimeMs - a.totalUptimeMs || a.spellName.localeCompare(b.spellName);
    return {
      buffs: mapped.filter((aura) => aura.isBuff).sort(byUptime),
      debuffs: mapped.filter((aura) => !aura.isBuff).sort(byUptime),
    };
  }, [byUnit, encounterOffsets, selectedGuid]);

  const selected = searchUnits.find((unit) => unit.guid === selectedGuid) ?? null;

  return (
    <GenericPanel {...props}>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <UnitSearch
          units={searchUnits}
          selectedGuid={selectedGuid}
          onChange={(guid) => setPanelOption?.(guid ? `u:${guid}` : null)}
        />

        {!selected ? (
          <div className="flex min-h-40 flex-1 flex-col items-center justify-center rounded-md border border-dashed border-border/70 bg-muted/10 px-6 text-center">
            <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
              <Sparkles className="size-5" />
            </div>
            <div className="text-sm font-medium">Choose a unit to inspect</div>
            <div className="mt-1 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Search any friendly player, companion, or hostile creature with recorded buffs or debuffs.
            </div>
          </div>
        ) : rows.buffs.length === 0 && rows.debuffs.length === 0 ? (
          <div className="flex min-h-32 flex-1 items-center justify-center text-xs text-muted-foreground">
            No auras recorded for {selected.name}.
          </div>
        ) : checkboxChecked ? (
          <CompactAuraGrid
            rows={[...rows.buffs, ...rows.debuffs]}
            durationMs={durationMs}
          />
        ) : (
          <ScrollArea className="min-h-0 flex-1 rounded border border-border/70 bg-background/25">
            <div className="min-w-0">
              <AuraSection
                title="Buffs"
                rows={rows.buffs}
                durationMs={durationMs}
                players={context.instance.players}
                units={context.instance.units}
                encounterNames={encounterNames}
              />
              <AuraSection
                title="Debuffs"
                rows={rows.debuffs}
                durationMs={durationMs}
                players={context.instance.players}
                units={context.instance.units}
                encounterNames={encounterNames}
              />
            </div>
          </ScrollArea>
        )}
      </div>
    </GenericPanel>
  );
}
