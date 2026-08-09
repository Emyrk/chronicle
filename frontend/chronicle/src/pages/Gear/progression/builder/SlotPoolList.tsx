import { Trash2 } from "lucide-react";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";
import { itemFitsSlot, type ProgressionPoolItem } from "../progressionModel";

interface SlotPoolListProps {
  slotIndex: number;
  pool: readonly ProgressionPoolItem[];
  items: Map<string, HydratedItem>;
  /** The item the derivation currently equips here, if any. */
  equippedItemId?: number;
  /** Character level, so rows can say which candidates aren't usable yet. */
  level: number;
  onRemove?: (itemId: number) => void;
}

/**
 * This slot's slice of the item pool: every candidate the player has
 * picked that can go here, marked with which one the derivation is
 * currently equipping and which are still level-locked.
 *
 * This is what "clicking a slot selects the pool for that slot" means —
 * the pool is never browsed as one flat list.
 */
export function SlotPoolList({
  slotIndex,
  pool,
  items,
  equippedItemId,
  level,
  onRemove,
}: SlotPoolListProps) {
  const candidates = pool
    .map((entry) => {
      const item = items.get(itemRefKey(entry.item_id));
      return {
        entry,
        item,
        inventoryType: item?.tooltip?.inventory_type ?? -1,
        requiredLevel: item?.tooltip?.required_level ?? 0,
        itemLevel: item?.itemLevel ?? 0,
      };
    })
    // Items whose tooltip hasn't landed yet have no inventory type, so we
    // can't place them; they appear once hydrated.
    .filter((c) => itemFitsSlot(c.inventoryType, slotIndex))
    .sort((a, b) => b.requiredLevel - a.requiredLevel || b.itemLevel - a.itemLevel);

  if (candidates.length === 0) {
    return (
      <p className="text-xs text-zinc-500">
        Nothing in the pool for this slot yet — search below to add candidates.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="text-3xs uppercase tracking-wide text-zinc-600">
        In your pool for this slot
      </div>
      <div className="divide-y divide-zinc-800/70 rounded border border-zinc-800">
        {candidates.map(({ entry, item, requiredLevel }) => {
          const equipped = entry.item_id === equippedItemId;
          const locked = requiredLevel > level;
          return (
            <div
              key={entry.item_id}
              className={cn(
                "flex items-center gap-2.5 px-2.5 py-1.5",
                equipped && "bg-blue-500/10",
              )}
            >
              <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={24} />
              <div className="min-w-0 flex-1">
                <div
                  className={cn(
                    "truncate text-xs",
                    getQualityTextClass(item?.quality ?? 1),
                    locked && "opacity-50",
                  )}
                >
                  {item?.name || `Item #${entry.item_id}`}
                </div>
                <div className="flex items-center gap-2 font-mono text-3xs text-zinc-500">
                  <span>req {requiredLevel > 0 ? requiredLevel : "—"}</span>
                  {item?.itemLevel != null && <span>ilvl {item.itemLevel}</span>}
                </div>
              </div>
              {equipped && (
                <span className="rounded border border-blue-400/40 px-1 text-3xs uppercase tracking-wide text-blue-400">
                  equipped
                </span>
              )}
              {locked && !equipped && (
                <span className="text-3xs uppercase tracking-wide text-zinc-600">
                  at {requiredLevel}
                </span>
              )}
              {onRemove && (
                <button
                  type="button"
                  title="Remove from pool"
                  aria-label={`Remove ${item?.name ?? `item ${entry.item_id}`} from the pool`}
                  className="p-1 text-zinc-600 transition-colors hover:text-red-400"
                  onClick={() => onRemove(entry.item_id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
