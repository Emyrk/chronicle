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

function formatPercent(uptimeMs: number, durationMs: number): string {
  if (durationMs <= 0) return "0%";
  const percent = Math.min(100, (uptimeMs / durationMs) * 100);
  return percent >= 10 ? `${percent.toFixed(0)}%` : `${percent.toFixed(1)}%`;
}

function resolveSourceName(
  segment: DisplaySegment,
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"],
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"],
): string {
  if (!segment.sourceGuid) return "Unknown source";
  if (segment.sourceName === "Self") return "Self";
  return players?.[segment.sourceGuid]?.name
    ?? units?.[segment.sourceGuid]?.name
    ?? segment.sourceName
    ?? segment.sourceGuid;
}

function AuraTimeline({
  segments,
  durationMs,
  players,
  units,
}: {
  segments: DisplaySegment[];
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
}) {
  if (durationMs <= 0) return null;

  return (
    <div className="relative h-2.5 overflow-hidden rounded-sm bg-foreground/15">
      {segments.map((segment, index) => {
        const left = (segment.displayStartMs / durationMs) * 100;
        const width = ((segment.displayEndMs - segment.displayStartMs) / durationMs) * 100;
        if (width <= 0) return null;
        const name = resolveSourceName(segment, players, units);
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
            </TooltipContent>
          </HintTooltip>
        );
      })}
    </div>
  );
}

function SourceLegend({
  segments,
  players,
  units,
}: {
  segments: DisplaySegment[];
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
}) {
  const groups = new Map<string, { guid: string | null; name: string; ranges: string[] }>();
  for (const segment of segments) {
    const key = segment.sourceGuid ?? "unknown";
    const group = groups.get(key) ?? {
      guid: segment.sourceGuid,
      name: resolveSourceName(segment, players, units),
      ranges: [],
    };
    group.ranges.push(`${formatTime(segment.startMs)}–${formatTime(segment.endMs)}`);
    groups.set(key, group);
  }

  return (
    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] leading-none text-muted-foreground">
      {[...groups.values()].map((group) => (
        <span key={group.guid ?? "unknown"} className="inline-flex min-w-0 items-center gap-1">
          <span className="size-1.5 shrink-0 rounded-[2px]" style={{ backgroundColor: sourceColor(group.guid) }} />
          <span className="max-w-28 truncate text-foreground/75">{group.name}</span>
          <span>{group.ranges.join(", ")}</span>
        </span>
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
}: {
  title: "Buffs" | "Debuffs";
  rows: AuraRow[];
  durationMs: number;
  players: PanelRenderProps<UnitAurasResult>["context"]["instance"]["players"];
  units: PanelRenderProps<UnitAurasResult>["context"]["instance"]["units"];
}) {
  const buffs = title === "Buffs";
  if (rows.length === 0) return null;

  return (
    <section>
      <div className={cn(
        "sticky top-0 z-10 border-y border-border/60 bg-card/95 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm",
        buffs ? "text-sky-400" : "text-rose-400",
      )}>
        {title}
      </div>
      <div className="divide-y divide-border/45">
        {rows.map((row) => (
          <div key={row.auraKey} className="px-3 py-2.5 transition-colors hover:bg-muted/20">
            <div className="mb-2 flex items-center gap-2.5">
              <SpellIdTooltip
                spellId={row.spellId}
                name={row.spellName}
                size={30}
                className="min-w-0 flex-1 truncate text-xs font-medium"
              />
              <div className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                {formatPercent(row.totalUptimeMs, durationMs)}
              </div>
            </div>
            <AuraTimeline segments={row.segments} durationMs={durationMs} players={players} units={units} />
            <SourceLegend segments={row.segments} players={players} units={units} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function UnitAurasContent(props: PanelRenderProps<UnitAurasResult>) {
  const { context, durationMs, panelOption, setPanelOption, result } = props;
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
      segments: aura.segments
        .map((segment) => {
          const offset = encounterOffsets.get(segment.encounterId) ?? 0;
          return {
            ...segment,
            displayStartMs: offset + segment.startMs,
            displayEndMs: offset + segment.endMs,
          };
        })
        .sort((a, b) => a.displayStartMs - b.displayStartMs),
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
      <div className="flex min-h-0 flex-1 flex-col gap-2">
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
        ) : (
          <ScrollArea className="min-h-0 flex-1 rounded-md border border-border/70 bg-background/25">
            <div className="min-w-0">
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/15 px-3 py-2">
                <UnitIcon unit={selected} />
                <span className="truncate text-xs font-semibold">{selected.name}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {rows.buffs.length} buffs · {rows.debuffs.length} debuffs
                </span>
              </div>
              <AuraSection title="Buffs" rows={rows.buffs} durationMs={durationMs} players={context.instance.players} units={context.instance.units} />
              <AuraSection title="Debuffs" rows={rows.debuffs} durationMs={durationMs} players={context.instance.players} units={context.instance.units} />
            </div>
          </ScrollArea>
        )}
      </div>
    </GenericPanel>
  );
}
