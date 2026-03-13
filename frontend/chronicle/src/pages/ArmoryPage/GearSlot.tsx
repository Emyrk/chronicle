import { useState } from "react";
import { useItemTooltip } from "@/api/gamedata";
import type { PlayerGear } from "@/api/typesGenerated";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { cn } from "@/lib/utils";
import type { GearSlotDef } from "./types";
import { getQualityBorderClass, getQualityTextClass } from "./types";

function getItemIconUrl(icon: string): string {
  if (!icon) return "";
  return `https://icons.chronicleclassic.com/${icon.toLowerCase()}.webp`;
}

export type GearSlotSide = "left" | "right" | "bottom";

interface GearSlotProps {
  slotDef: GearSlotDef;
  item: PlayerGear;
  /** Which side the name label appears on. */
  side?: GearSlotSide;
}

export function GearSlot({ slotDef, item, side = "right" }: GearSlotProps) {
  const [hovered, setHovered] = useState(false);
  const tooltipData = useItemTooltip(
    item.item_id > 0
      ? { itemId: item.item_id, enchant: item.enchant_id }
      : null,
  );

  const isEmpty = item.item_id === 0;
  const borderClass = isEmpty
    ? "border-zinc-700"
    : getQualityBorderClass(item.item_quality ?? 0);
  const nameClass = isEmpty
    ? "text-zinc-600"
    : getQualityTextClass(item.item_quality ?? 0);
  const displayName = isEmpty ? slotDef.label : (item.item_name ?? "");

  const nameLabel = (
    <span
      className={cn(
        "text-2xs leading-tight truncate max-w-28",
        nameClass,
        isEmpty && "italic",
      )}
    >
      {displayName}
    </span>
  );

  return (
    <div
      className={cn(
        "relative flex items-center gap-2",
        side === "left" && "flex-row-reverse",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "w-11 h-11 shrink-0 rounded border-2 bg-zinc-900/80 flex items-center justify-center overflow-hidden transition-colors",
          borderClass,
          !isEmpty && "hover:brightness-125 cursor-pointer",
        )}
      >
        {!isEmpty && item.item_icon ? (
          <img
            src={getItemIconUrl(item.item_icon)}
            alt={item.item_name ?? ""}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-3xs text-zinc-600 text-center leading-tight select-none">
            {slotDef.label}
          </span>
        )}
      </div>

      {nameLabel}

      {/* Tooltip popover */}
      {hovered && tooltipData.data && (
        <div className={cn(
          "absolute z-50 top-0 pointer-events-none",
          side === "left" ? "right-full mr-2" : "left-full ml-2",
        )}>
          <ItemTooltip item={tooltipData.data} />
        </div>
      )}
    </div>
  );
}
