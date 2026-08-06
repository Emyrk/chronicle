import { useState } from "react";
import { Check, Plus, StickyNote, X } from "lucide-react";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { CursorTooltip, type CursorPos } from "@/pages/ArmoryPage/overview/CursorTooltip";
import { getQualityBorderClass, getQualityTextClass, type GearSlotDef } from "@/pages/ArmoryPage/types";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import type { GearSlotEntry } from "./gearListModel";
import { formatScore } from "./gearScoring";
import type { HydratedItem } from "./useListItems";

export type BuilderSlotSide = "left" | "right" | "bottom";

interface BuilderSlotProps {
  slotDef: GearSlotDef;
  entry?: GearSlotEntry;
  item?: HydratedItem;
  side?: BuilderSlotSide;
  selected?: boolean;
  onSelect?: (outfitIndex: number) => void;
  equippedItemIds?: ReadonlySet<number>;
  /** Weighted stat score for the equipped item, when weights are active. */
  score?: number;
  /** Character-match state for this slot, when a character is matched. */
  matchState?: "equipped" | "missing";
}

/**
 * One slot of the builder paperdoll: quality-bordered icon, name label,
 * enchant line, alternate/note badges, hover tooltip. Clicking selects the
 * slot for editing (when onSelect is provided).
 */
export function BuilderSlot({
  slotDef,
  entry,
  item,
  side = "right",
  selected = false,
  onSelect,
  equippedItemIds,
  score,
  matchState,
}: BuilderSlotProps) {
  const iconBaseUrl = useIconBaseUrl();
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState<CursorPos | null>(null);

  const isEmpty = !entry;
  const quality = item?.quality ?? 1;
  const borderClass = isEmpty ? "border-zinc-700" : getQualityBorderClass(quality);
  const nameClass = isEmpty ? "text-zinc-600" : getQualityTextClass(quality);
  const displayName = isEmpty
    ? slotDef.label
    : item?.name || `Item #${entry.item_id}`;
  const altCount = entry?.alternates?.length ?? 0;
  const enchantText = item?.tooltip?.enchantment;
  const showTooltip = cursor != null && !isMobile && !isEmpty && item?.tooltip;

  const nameLabel = (
    <div className={cn("flex flex-col min-w-0", side === "left" && "items-end")}>
      <span
        className={cn(
          "text-2xs leading-tight truncate",
          side === "bottom" ? "max-w-full" : "max-w-36",
          nameClass,
          isEmpty && "italic",
        )}
      >
        {displayName}
      </span>
      {enchantText && (
        <span
          className={cn(
            "text-2xs leading-tight text-quality-uncommon line-clamp-2",
            side === "bottom" ? "max-w-full" : "max-w-36",
            side === "left" && "text-right",
          )}
        >
          {enchantText}
        </span>
      )}
      {(altCount > 0 || entry?.note || score !== undefined) && (
        <span
          className={cn(
            "flex items-center gap-1 text-3xs text-zinc-500",
            side === "left" && "flex-row-reverse",
          )}
        >
          {score !== undefined && (
            <span className="font-mono text-zinc-400">{formatScore(score)} pts</span>
          )}
          {altCount > 0 && <span>+{altCount} alt{altCount === 1 ? "" : "s"}</span>}
          {entry?.note && <StickyNote className="h-2.5 w-2.5" />}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex items-center gap-2",
        side === "left" && "flex-row-reverse",
        side === "bottom" && "min-w-0",
      )}
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setCursor(null)}
    >
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => onSelect?.(slotDef.outfitIndex)}
          className={cn(
            "w-11 h-11 rounded border-2 bg-zinc-900/80 flex items-center justify-center overflow-hidden transition-all",
            borderClass,
            onSelect && "cursor-pointer hover:brightness-125",
            selected && "ring-2 ring-blue-400 ring-offset-1 ring-offset-zinc-950",
          )}
        >
          {!isEmpty && item?.icon ? (
            <img
              src={iconUrl(item.icon, iconBaseUrl)}
              alt={displayName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : isMobile ? (
            // Side labels are hidden on mobile; name the slot in the box.
            <span className="text-3xs text-zinc-600 text-center leading-tight select-none">
              {slotDef.label}
            </span>
          ) : onSelect ? (
            <Plus className="h-4 w-4 text-zinc-700" />
          ) : null}
        </button>
        {!isEmpty && matchState && (
          <span
            title={
              matchState === "equipped"
                ? "The matched character is wearing this (or a listed alternate)"
                : "The matched character is not wearing this"
            }
            className={cn(
              "absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-zinc-950",
              matchState === "equipped" && "bg-blue-500 text-white",
              matchState === "missing" && "bg-amber-400 text-zinc-950",
            )}
          >
            {matchState === "missing" ? (
              <X className="h-2.5 w-2.5" strokeWidth={3.5} />
            ) : (
              <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
            )}
          </span>
        )}
      </div>

      {!isMobile && nameLabel}

      {showTooltip && (
        <CursorTooltip pos={cursor!}>
          <ItemTooltip item={item.tooltip!} equippedItemIds={equippedItemIds} />
        </CursorTooltip>
      )}
    </div>
  );
}
