import { X } from "lucide-react";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS, getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { slotLabel } from "@/pages/Gear/builder/SlotEditorPanel";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";
import type { GearStage } from "@/pages/Gear/builder/gearListModel";

const GRID_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

interface StageSlotGridProps {
  stage: GearStage;
  /** The stage before this one; unchanged slots render dimmed as carried. */
  previous?: GearStage;
  items: Map<string, HydratedItem>;
  selectedSlot?: number;
  onSelectSlot?: (slotIndex: number) => void;
  onClearSlot?: (slotIndex: number) => void;
}

/**
 * The explicit picks for one max-level stage. Unlike the leveling grid
 * these are stored, so slots are selectable and clearable in edit mode.
 */
export function StageSlotGrid({
  stage,
  previous,
  items,
  selectedSlot,
  onSelectSlot,
  onClearSlot,
}: StageSlotGridProps) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {GRID_SLOTS.map((def) => {
        const key = String(def.outfitIndex);
        const entry = stage.slots[key];
        const prev = previous?.slots[key];
        const carried = !!entry && !!prev && entry.item_id === prev.item_id;
        const item = entry ? items.get(itemRefKey(entry.item_id)) : undefined;
        const selected = selectedSlot === def.outfitIndex;

        return (
          <div
            key={def.outfitIndex}
            className={cn(
              "flex items-center gap-2 rounded border px-2 py-1.5 transition-colors",
              selected
                ? "border-blue-500 bg-blue-500/10"
                : entry
                  ? "border-zinc-700/60 bg-zinc-900/40"
                  : "border-dashed border-zinc-800",
              onSelectSlot && !selected && "hover:border-zinc-600",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left"
              disabled={!onSelectSlot}
              onClick={() => onSelectSlot?.(def.outfitIndex)}
            >
              <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={26} />
              <div className="min-w-0 flex-1">
                <div className="text-3xs uppercase tracking-wide text-zinc-600">
                  {slotLabel(def.outfitIndex)}
                </div>
                <div
                  className={cn(
                    "truncate text-xs",
                    entry ? getQualityTextClass(item?.quality ?? 1) : "text-zinc-700 italic",
                    carried && "opacity-50",
                  )}
                >
                  {entry ? item?.name || `Item #${entry.item_id}` : "empty"}
                </div>
              </div>
              {entry && item?.itemLevel != null && (
                <span className="shrink-0 font-mono text-2xs text-zinc-500">{item.itemLevel}</span>
              )}
            </button>
            {onClearSlot && entry && (
              <button
                type="button"
                title="Clear slot"
                aria-label={`Clear ${slotLabel(def.outfitIndex)}`}
                className="p-0.5 text-zinc-600 transition-colors hover:text-red-400"
                onClick={() => onClearSlot(def.outfitIndex)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
