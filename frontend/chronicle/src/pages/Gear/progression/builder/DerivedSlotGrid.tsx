import { CornerDownRight } from "lucide-react";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS, getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { slotLabel } from "@/pages/Gear/builder/SlotEditorPanel";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";
import type { DerivedEquipped } from "../progressionModel";

/** Grid order: armory paperdoll order, weapons last. */
const GRID_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

interface DerivedSlotGridProps {
  equipped: DerivedEquipped;
  /** The set one level earlier; unchanged slots render dimmed as carried. */
  previous?: DerivedEquipped;
  items: Map<string, HydratedItem>;
  /** Click a filled slot (e.g. to reveal the pool item behind it). */
  onSlotClick?: (slotIndex: number) => void;
}

/**
 * The derived best-per-slot set for one level. Nothing here is stored —
 * it is recomputed from the pool — so the grid is read-only. Slots
 * carried over from the previous level are dimmed, borrowing the
 * gear-list progression matrix's visual language.
 */
export function DerivedSlotGrid({
  equipped,
  previous,
  items,
  onSlotClick,
}: DerivedSlotGridProps) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
      {GRID_SLOTS.map((def) => {
        const itemId = equipped[def.outfitIndex];
        const prevItemId = previous?.[def.outfitIndex];
        const carried = itemId != null && itemId === prevItemId;
        const item = itemId != null ? items.get(itemRefKey(itemId)) : undefined;

        const body = (
          <>
            <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={26} />
            <div className="min-w-0 flex-1 text-left">
              <div className="text-3xs uppercase tracking-wide text-zinc-600">
                {slotLabel(def.outfitIndex)}
              </div>
              <div
                className={cn(
                  "truncate text-xs",
                  itemId == null
                    ? "text-zinc-700 italic"
                    : getQualityTextClass(item?.quality ?? 1),
                  carried && "opacity-50",
                )}
              >
                {itemId == null ? "nothing in the pool yet" : item?.name || `Item #${itemId}`}
              </div>
            </div>
            {carried && (
              <CornerDownRight className="h-3 w-3 shrink-0 text-zinc-700" aria-label="carried" />
            )}
            {itemId != null && item?.itemLevel != null && !carried && (
              <span className="shrink-0 font-mono text-2xs text-zinc-500">{item.itemLevel}</span>
            )}
          </>
        );

        const className = cn(
          "flex w-full items-center gap-2 rounded border px-2 py-1.5 transition-colors",
          itemId == null
            ? "border-dashed border-zinc-800 bg-transparent"
            : "border-zinc-700/60 bg-zinc-900/40",
          onSlotClick && itemId != null && "hover:border-zinc-600",
        );

        return onSlotClick && itemId != null ? (
          <button
            key={def.outfitIndex}
            type="button"
            className={className}
            onClick={() => onSlotClick(def.outfitIndex)}
          >
            {body}
          </button>
        ) : (
          <div key={def.outfitIndex} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
