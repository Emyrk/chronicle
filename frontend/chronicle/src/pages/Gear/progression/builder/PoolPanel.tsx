import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { BOTTOM_SLOTS, LEFT_SLOTS, RIGHT_SLOTS, getQualityTextClass } from "@/pages/ArmoryPage/types";
import { cn } from "@/lib/utils";
import { ItemPickerPanel } from "@/pages/Gear/builder/ItemPickerPanel";
import { slotLabel } from "@/pages/Gear/builder/SlotEditorPanel";
import { itemRefKey, type HydratedItem } from "@/pages/Gear/builder/useListItems";
import { MAX_POOL_ITEMS, type ProgressionPoolItem } from "../progressionModel";

const ALL_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

interface PoolPanelProps {
  pool: readonly ProgressionPoolItem[];
  items: Map<string, HydratedItem>;
  /** Absent in read-only mode. */
  onAdd?: (itemId: number) => void;
  onRemove?: (itemId: number) => void;
}

/**
 * The player-picked item pool. Everything the two scrubbers show is
 * derived from this list, so it is the only thing the leveling half
 * actually stores.
 */
export function PoolPanel({ pool, items, onAdd, onRemove }: PoolPanelProps) {
  const [pickerSlot, setPickerSlot] = useState<number | null>(null);
  const editable = !!onAdd;
  const poolIds = useMemo(() => new Set(pool.map((p) => p.item_id)), [pool]);

  // Group by the slot the item's inventory type belongs to so the list
  // reads like the paperdoll rather than like insertion order.
  const rows = useMemo(() => {
    const decorated = pool.map((entry) => {
      const item = items.get(itemRefKey(entry.item_id));
      return {
        entry,
        item,
        inventoryType: item?.tooltip?.inventory_type ?? 0,
        requiredLevel: item?.tooltip?.required_level ?? 0,
        itemLevel: item?.itemLevel ?? 0,
      };
    });
    return decorated.sort(
      (a, b) =>
        a.inventoryType - b.inventoryType ||
        a.requiredLevel - b.requiredLevel ||
        b.itemLevel - a.itemLevel,
    );
  }, [pool, items]);

  return (
    <div className="space-y-3 rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3">
      <div className="flex items-center gap-2">
        <h2 className="font-wow text-base text-amber-100/90">Item pool</h2>
        <span className="font-mono text-2xs text-zinc-500">
          {pool.length}/{MAX_POOL_ITEMS}
        </span>
        <div className="flex-1" />
        {editable && (
          <select
            className="h-8 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-300"
            value={pickerSlot ?? ""}
            onChange={(e) => setPickerSlot(e.target.value === "" ? null : Number(e.target.value))}
          >
            <option value="">Add item for…</option>
            {ALL_SLOTS.map((s) => (
              <option key={s.outfitIndex} value={s.outfitIndex}>
                {slotLabel(s.outfitIndex)}
              </option>
            ))}
          </select>
        )}
      </div>

      {editable && pickerSlot != null && (
        <div className="space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              Searching {slotLabel(pickerSlot)} items
            </span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setPickerSlot(null)}>
              Done
            </Button>
          </div>
          <ItemPickerPanel
            slotIndex={pickerSlot}
            usedItemIds={poolIds}
            usedLabel="in pool"
            equipLabel="Add"
            onEquip={(item) => onAdd?.(item.entry)}
          />
        </div>
      )}

      {pool.length === 0 ? (
        <p className="text-sm text-zinc-500">
          The pool is empty. {editable ? "Pick items above" : "Nothing picked yet"} — the leveling
          scrubber derives best-per-slot from whatever is in here.
        </p>
      ) : (
        <div className="max-h-96 divide-y divide-zinc-800/70 overflow-y-auto styled-scrollbar rounded border border-zinc-800">
          {rows.map(({ entry, item, requiredLevel }) => (
            <div
              key={entry.item_id}
              className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-zinc-800/40"
            >
              <ItemIcon icon={item?.icon} quality={item?.quality ?? 1} size={26} />
              <div className="min-w-0 flex-1">
                <div className={cn("truncate text-sm", getQualityTextClass(item?.quality ?? 1))}>
                  {item?.name || `Item #${entry.item_id}`}
                </div>
                <div className="flex items-center gap-2 font-mono text-2xs text-zinc-500">
                  <span>req {requiredLevel > 0 ? requiredLevel : "—"}</span>
                  {item?.itemLevel != null && <span>ilvl {item.itemLevel}</span>}
                </div>
              </div>
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
          ))}
        </div>
      )}

      {editable && pool.length > 0 && pickerSlot == null && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setPickerSlot(0)}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          Add more items
        </Button>
      )}
    </div>
  );
}
