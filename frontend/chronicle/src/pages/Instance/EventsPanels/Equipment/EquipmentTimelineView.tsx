import { useMemo, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { useItemTooltip } from "@/api/gamedata";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip";
import { useTalentTrees } from "@/components/ui/TalentTreeViewer/useTalentTrees";
import { resolvePlayerSpecialization } from "@/components/ui/PlayerMetricChart/playerSpecialization";
import { iconUrl } from "@/config/iconUrl";
import { cn } from "@/lib/utils";
import { getQualityBorderClass, getQualityTextClass } from "@/pages/ArmoryPage/types";
import type { PanelContext } from "../types";
import type { PlayerSnapshot } from "./equipment.processor";
import {
  buildEquipmentTimeline,
  type EquipmentSlotTimeline,
  type EquipmentSpecSegment,
  type EquipmentTimelineSegment,
} from "./equipmentTimeline";

const QUALITY_COLORS: Record<number, string> = {
  0: "var(--color-quality-poor)",
  1: "var(--color-quality-common)",
  2: "var(--color-quality-uncommon)",
  3: "var(--color-quality-rare)",
  4: "var(--color-quality-epic)",
  5: "var(--color-quality-legendary)",
  6: "var(--color-quality-artifact)",
};

function formatOffset(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function itemAt(slot: EquipmentSlotTimeline, time: number): EquipmentTimelineSegment | null {
  let active: EquipmentTimelineSegment | null = null;
  for (const segment of slot.segments) {
    if (segment.start > time) break;
    active = segment;
  }
  return active && active.lastSeen >= time ? active : null;
}

function TimelineRow({ label, current, children }: { label: string; current: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_11rem] items-center gap-3 border-b border-border/30 py-0.5 last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="relative mx-3 h-7">{children}</div>
      <div className="min-w-0">{current}</div>
    </div>
  );
}

function TimelineItem({
  segment,
  left,
  width,
  equippedItemIds,
}: {
  segment: EquipmentTimelineSegment;
  left: number;
  width: number;
  equippedItemIds: ReadonlySet<number>;
}) {
  const tooltip = useItemTooltip({ itemId: segment.item.itemId, enchant: segment.item.enchantId ?? undefined });
  const quality = tooltip.data?.quality ?? 1;
  const color = QUALITY_COLORS[quality] ?? QUALITY_COLORS[1];
  const marker = (
    <span
      className={cn("absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded border bg-popover", getQualityBorderClass(quality))}
      style={{ left: `${left}%` }}
    >
      {tooltip.data?.icon ? (
        <img src={iconUrl(tooltip.data.icon)} alt={tooltip.data.name ?? ""} className="size-full object-cover" loading="lazy" />
      ) : (
        <HelpCircle className="m-1 size-3.5 text-muted-foreground" />
      )}
    </span>
  );

  return (
    <>
      <span
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-70"
        style={{ left: `${left}%`, width: `max(${width}%, 4px)`, backgroundColor: color }}
      />
      {tooltip.data ? (
        <TooltipProvider>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>{marker}</TooltipTrigger>
            <TooltipContent side="bottom" className="z-[10000] border-0 bg-transparent p-0" hideArrow>
              <ItemTooltip item={tooltip.data} gemEnchantIds={segment.item.gemEnchantIds} equippedItemIds={equippedItemIds} />
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : marker}
    </>
  );
}

function CurrentItem({ segment }: { segment: EquipmentTimelineSegment | null }) {
  const tooltip = useItemTooltip(segment ? { itemId: segment.item.itemId, enchant: segment.item.enchantId ?? undefined } : null);
  if (!segment) return <span className="text-xs text-muted-foreground">—</span>;
  const quality = tooltip.data?.quality ?? 1;
  return (
    <span className={cn("block truncate text-xs", getQualityTextClass(quality))}>
      {tooltip.data?.name ?? `Item ${segment.item.itemId}`}
      {segment.item.itemLevel != null && <span className="ml-1 text-muted-foreground">{segment.item.itemLevel}</span>}
    </span>
  );
}

function SpecMarker({
  player,
  segment,
  left,
  width,
  context,
}: {
  player: PlayerSnapshot;
  segment: EquipmentSpecSegment;
  left: number;
  width: number;
  context: PanelContext;
}) {
  const { data } = useTalentTrees(context.instance.datasetId);
  const specialization = data && segment.talents ? resolvePlayerSpecialization({
    heroClass: player.heroClass,
    summary: segment.talents.summary,
    trees: segment.talents.trees,
  }, data.classes, context.instance.flavor ?? []) : null;
  const label = specialization
    ? `${specialization.name}${specialization.subSpec ? ` (${specialization.subSpec})` : ""}`
    : segment.talents?.summary.join("/") ?? "Unknown spec";

  return (
    <>
      <span
        className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-70"
        style={{ left: `${left}%`, width: `max(${width}%, 4px)`, backgroundColor: `var(--color-class-${player.heroClass.toLowerCase().replace(/\s+/g, "")})` }}
      />
      <TooltipProvider>
        <Tooltip delayDuration={100}>
          <TooltipTrigger asChild>
            <span
              className="absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center overflow-hidden rounded border border-border bg-popover text-[9px] font-semibold"
              style={{ left: `${left}%` }}
            >
              {specialization ? <img src={specialization.iconUrl} alt={specialization.name} className="size-full object-cover" /> : "SPEC"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <div className="text-xs font-medium">{label}</div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {segment.talents ? `${segment.talents.summary.join("/")} talents` : "No talent data"}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </>
  );
}

function CurrentSpec({ player, segment, context }: { player: PlayerSnapshot; segment: EquipmentSpecSegment | null; context: PanelContext }) {
  const { data } = useTalentTrees(context.instance.datasetId);
  if (!segment) return <span className="text-xs text-muted-foreground">—</span>;
  const specialization = data && segment.talents ? resolvePlayerSpecialization({
    heroClass: player.heroClass,
    summary: segment.talents.summary,
    trees: segment.talents.trees,
  }, data.classes, context.instance.flavor ?? []) : null;
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-xs">
      {specialization && <img src={specialization.iconUrl} alt="" className="size-4 rounded" />}
      <span className="truncate">
        {specialization?.name ?? "Unknown spec"}
        {specialization?.subSpec ? ` (${specialization.subSpec})` : ""}
        {segment.talents && <span className="ml-1 font-mono text-muted-foreground">{segment.talents.summary.join("/")}</span>}
      </span>
    </span>
  );
}

export function EquipmentTimelineView({
  player,
  snapshots,
  context,
}: {
  player: PlayerSnapshot;
  snapshots: readonly PlayerSnapshot[];
  context: PanelContext;
}) {
  const timeline = useMemo(() => buildEquipmentTimeline(snapshots), [snapshots]);
  if (!timeline) {
    return <div className="p-4 text-sm text-muted-foreground">No equipment history is available for this player.</div>;
  }

  const span = Math.max(timeline.end - timeline.start, 1);
  const position = (time: number) => timeline.end === timeline.start ? 0 : ((time - timeline.start) / span) * 100;
  const segmentWidth = (start: number, end: number) => timeline.end === timeline.start ? 100 : Math.max(position(end) - position(start), 0);
  const currentTime = timeline.end;
  const equippedItemIds = new Set(player.gear.filter((item) => item.itemId > 0).map((item) => item.itemId));
  const levels = timeline.itemLevels;
  const low = levels.length > 0 ? Math.min(...levels.map((point) => point.value)) : 0;
  const high = levels.length > 0 ? Math.max(...levels.map((point) => point.value)) : 0;
  const levelY = (value: number) => 85 - ((value - low) / Math.max(high - low, 1)) * 70;
  const latestSpec = timeline.specs.at(-1) ?? null;
  const talentChanges = Math.max(0, timeline.specs.length - 1);

  return (
    <div className="space-y-2 pt-1">
      <div className="text-2xs text-muted-foreground">
        {timeline.snapshotCount} recorded {timeline.snapshotCount === 1 ? "state" : "states"} · {timeline.changedSlots} {timeline.changedSlots === 1 ? "slot" : "slots"} changed · {talentChanges} talent {talentChanges === 1 ? "change" : "changes"}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-black/10 styled-scrollbar">
        <div className="min-w-[640px] px-3 py-2">
          {levels.length > 0 && (
            <TimelineRow
              label="Item level"
              current={<span className="font-mono text-sm font-semibold tabular-nums">{levels.at(-1)!.value.toFixed(1)}</span>}
            >
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
                <polyline
                  points={levels.map((point) => `${position(point.time)},${levelY(point.value)}`).join(" ")}
                  fill="none"
                  stroke="var(--color-amber-400)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </TimelineRow>
          )}
          <TimelineRow label="Spec" current={<CurrentSpec player={player} segment={latestSpec} context={context} />}>
            {timeline.specs.map((segment, index) => (
              <SpecMarker
                key={`${segment.start}-${index}`}
                player={player}
                segment={segment}
                left={position(segment.start)}
                width={segmentWidth(segment.start, segment.end)}
                context={context}
              />
            ))}
          </TimelineRow>
          {timeline.slots.map((slot) => (
            <TimelineRow key={slot.slot} label={slot.label} current={<CurrentItem segment={itemAt(slot, currentTime)} />}>
              {slot.segments.map((segment, index) => (
                <TimelineItem
                  key={`${segment.item.itemId}-${segment.start}-${index}`}
                  segment={segment}
                  left={position(segment.start)}
                  width={segmentWidth(segment.start, segment.end)}
                  equippedItemIds={equippedItemIds}
                />
              ))}
            </TimelineRow>
          ))}
          <TimelineRow label="" current={null}>
            <div className="flex h-full items-start justify-between pt-1 font-mono text-[10px] text-muted-foreground tabular-nums">
              <span>{formatOffset(timeline.start)}</span>
              <span>{formatOffset(timeline.end)}</span>
            </div>
          </TimelineRow>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Each icon marks the first combatant snapshot with that item or talent build. Bars show how long it remained recorded across the selected encounters.
      </p>
    </div>
  );
}
