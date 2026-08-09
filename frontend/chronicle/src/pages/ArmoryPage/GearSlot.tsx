import { useState, useCallback } from "react";
import { AlertTriangle } from "lucide-react";
import { iconUrl } from "@/config/iconUrl";
import { useIconBaseUrl } from "@/hooks/useDatasetId";
import { useItemTooltip } from "@/api/gamedata";
import type { PlayerGear } from "@/api/typesGenerated";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import type { GearSlotDef } from "./types";
import { getQualityBorderClass, getQualityTextClass } from "./types";

export type GearSlotSide = "left" | "right" | "bottom";

interface GearSlotProps {
  slotDef: GearSlotDef;
  item: PlayerGear;
  /** Which side the name label appears on. */
  side?: GearSlotSide;
  /** Set of all equipped item IDs (for set piece highlighting in tooltips). */
  equippedItemIds?: ReadonlySet<number>;
  /** True when the 3D model viewer failed to load display data for this slot. */
  modelError?: boolean;
}

export function GearSlot({ slotDef, item, side = "right", equippedItemIds, modelError }: GearSlotProps) {
  const iconBaseUrl = useIconBaseUrl();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const isMobile = useIsMobile();
  const tooltipData = useItemTooltip(
    item.item_id > 0
      ? { itemId: item.item_id, enchant: item.enchant_id }
      : null,
  );
  const transmogTooltipData = useItemTooltip(
    item.transmog_id && item.transmog_id > 0
      ? { itemId: item.transmog_id }
      : null,
  );

  const isEmpty = item.item_id === 0;
  const quality = item.item_quality ?? tooltipData.data?.quality ?? 0;
  const borderClass = isEmpty
    ? "border-zinc-700"
    : getQualityBorderClass(quality);
  const nameClass = isEmpty
    ? "text-zinc-600"
    : getQualityTextClass(quality);
  const iconName = item.item_icon || tooltipData.data?.icon;
  const displayName = isEmpty ? slotDef.label : (item.item_name || tooltipData.data?.name || `Item #${item.item_id}`);

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
          <span className={cn(
            "text-2xs leading-tight max-w-28 text-quality-uncommon line-clamp-2",
            side === "left" && "text-right",
          )}>
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
      <div className="relative shrink-0">
        <div
          className={cn(
            "w-11 h-11 rounded border-2 bg-zinc-900/80 flex items-center justify-center overflow-hidden transition-colors",
            borderClass,
            !isEmpty && "hover:brightness-125 cursor-pointer",
          )}
        >
          {!isEmpty && iconName ? (
            <img
              src={iconUrl(iconName, iconBaseUrl)}
              alt={displayName}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <span className="text-3xs text-zinc-600 text-center leading-tight select-none">
              {slotDef.label}
            </span>
          )}
        </div>
        {modelError && (
          <div className="absolute -top-1.5 -right-1.5 group/warn">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-2xs text-zinc-200 bg-zinc-800 border border-zinc-700 rounded shadow-lg whitespace-nowrap opacity-0 group-hover/warn:opacity-100 pointer-events-none transition-opacity">
              Some or all 3D model data unavailable
            </div>
          </div>
        )}
      </div>

      {!isMobile && nameLabel}

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
                <ItemTooltip item={tooltipData.data!} gemIds={item.gem_ids} equippedItemIds={equippedItemIds} transmogName={transmogTooltipData.data?.name} />
              </div>
            </div>
          ) : (
            /* Desktop: centered fixed tooltip */
            <div className="fixed inset-0 z-50 flex items-center justify-center -translate-y-[15%] pointer-events-none">
              <ItemTooltip item={tooltipData.data!} gemIds={item.gem_ids} equippedItemIds={equippedItemIds} transmogName={transmogTooltipData.data?.name} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
