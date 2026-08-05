import { useState } from "react";
import { StickyNote } from "lucide-react";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { getQualityBorderClass, getQualityTextClass, type GearSlotDef } from "@/pages/ArmoryPage/types";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import type { GearSlotEntry } from "./gearListModel";
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
}: BuilderSlotProps) {
  const iconBaseUrl = useIconBaseUrl();
  const isMobile = useIsMobile();
  const [hovered, setHovered] = useState(false);

  const isEmpty = !entry;
  const quality = item?.quality ?? 1;
  const borderClass = isEmpty ? "border-zinc-700" : getQualityBorderClass(quality);
  const nameClass = isEmpty ? "text-zinc-600" : getQualityTextClass(quality);
  const displayName = isEmpty
    ? slotDef.label
    : item?.name || `Item #${entry.item_id}`;
  const altCount = entry?.alternates?.length ?? 0;
  const enchantText = item?.tooltip?.enchantment;
  const showTooltip = hovered && !isMobile && !isEmpty && item?.tooltip;

  const nameLabel = (
    <div className={cn("flex flex-col min-w-0", side === "left" && "items-end")}>
      <span className={cn("text-2xs leading-tight truncate max-w-28", nameClass, isEmpty && "italic")}>
        {displayName}
      </span>
      {enchantText && (
        <span
          className={cn(
            "text-2xs leading-tight max-w-28 text-quality-uncommon line-clamp-2",
            side === "left" && "text-right",
          )}
        >
          {enchantText}
        </span>
      )}
      {(altCount > 0 || entry?.note) && (
        <span
          className={cn(
            "flex items-center gap-1 text-3xs text-zinc-500",
            side === "left" && "flex-row-reverse",
          )}
        >
          {altCount > 0 && <span>+{altCount} alt{altCount === 1 ? "" : "s"}</span>}
          {entry?.note && <StickyNote className="h-2.5 w-2.5" />}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn("relative flex items-center gap-2", side === "left" && "flex-row-reverse")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => onSelect?.(slotDef.outfitIndex)}
        className={cn(
          "w-11 h-11 rounded border-2 bg-zinc-900/80 flex items-center justify-center overflow-hidden transition-all shrink-0",
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
        ) : (
          <span className="text-3xs text-zinc-600 text-center leading-tight select-none">
            {slotDef.label}
          </span>
        )}
      </button>

      {!isMobile && nameLabel}

      {showTooltip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center -translate-y-[15%] pointer-events-none">
          <ItemTooltip item={item.tooltip!} equippedItemIds={equippedItemIds} />
        </div>
      )}
    </div>
  );
}
