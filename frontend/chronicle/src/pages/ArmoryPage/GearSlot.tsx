import { useState } from "react";
import { useItemTooltip } from "@/api/gamedata";
import type { PlayerGear } from "@/api/typesGenerated";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { cn } from "@/lib/utils";
import type { GearSlotDef } from "./types";
import { getQualityBorderClass } from "./types";

function getItemIconUrl(icon: string): string {
  if (!icon) return "";
  return `https://icons.chronicleclassic.com/${icon.toLowerCase()}.webp`;
}

interface GearSlotProps {
  slotDef: GearSlotDef;
  item: PlayerGear;
}

export function GearSlot({ slotDef, item }: GearSlotProps) {
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

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={cn(
          "w-11 h-11 rounded border-2 bg-zinc-900/80 flex items-center justify-center overflow-hidden transition-colors",
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

      {/* Tooltip popover */}
      {hovered && tooltipData.data && (
        <div className="absolute z-50 left-full ml-2 top-0 pointer-events-none">
          <ItemTooltip item={tooltipData.data} />
        </div>
      )}
    </div>
  );
}
