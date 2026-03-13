import { useState, useCallback } from "react";
import { useItemTooltip } from "@/api/gamedata";
import type { PlayerGear } from "@/api/typesGenerated";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
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
  const [pinned, setPinned] = useState(false);
  const isMobile = useIsMobile();
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

  const showTooltip = (hovered || pinned) && tooltipData.data && !isEmpty;

  const handleClick = useCallback(() => {
    if (isEmpty) return;
    if (isMobile) {
      setPinned((prev) => !prev);
    }
  }, [isMobile, isEmpty]);

  const enchantText = tooltipData.data?.enchantment;

  const nameLabel = (
    <div className={cn(
      "flex flex-col min-w-0",
      side === "left" && "items-end",
    )}>
      <span
        className={cn(
          "text-2xs leading-tight truncate max-w-28",
          nameClass,
          isEmpty && "italic",
        )}
      >
        {displayName}
      </span>
      {enchantText && (
        <span className="text-2xs leading-tight max-w-28 text-quality-uncommon line-clamp-2">
          {enchantText}
        </span>
      )}
    </div>
  );

  return (
    <div
      className={cn(
        "relative flex items-center gap-2",
        side === "left" && "flex-row-reverse",
      )}
      onMouseEnter={() => !isMobile && setHovered(true)}
      onMouseLeave={() => !isMobile && setHovered(false)}
      onClick={handleClick}
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

      {/* Tooltip — centered overlay on mobile, fixed center on desktop */}
      {showTooltip && (
        <>
          {/* Mobile: full-screen overlay with centered tooltip */}
          {isMobile ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={(e) => {
                e.stopPropagation();
                setPinned(false);
              }}
            >
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button
                  className="absolute -top-3 -right-3 z-10 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-sm font-bold shadow-lg"
                  onClick={() => setPinned(false)}
                  aria-label="Close tooltip"
                >
                  ✕
                </button>
                <ItemTooltip item={tooltipData.data!} />
              </div>
            </div>
          ) : (
            /* Desktop: centered fixed tooltip */
            <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <ItemTooltip item={tooltipData.data!} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
