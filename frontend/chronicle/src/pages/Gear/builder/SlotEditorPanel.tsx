import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQualityTextClass, LEFT_SLOTS, RIGHT_SLOTS, BOTTOM_SLOTS } from "@/pages/ArmoryPage/types";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import type { ItemSearchResult } from "@/api/typesGenerated";
import type { GearSlotEntry } from "./gearListModel";
import { itemRefKey, type HydratedItem } from "./useListItems";
import { ItemPickerPanel } from "./ItemPickerPanel";

const ALL_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

export function slotLabel(outfitIndex: number): string {
  return ALL_SLOTS.find((s) => s.outfitIndex === outfitIndex)?.label ?? `Slot ${outfitIndex}`;
}

interface SlotEditorPanelProps {
  slotIndex: number;
  entry?: GearSlotEntry;
  items: Map<string, HydratedItem>;
  onEquip: (item: ItemSearchResult) => void;
  onClear: () => void;
  onClose: () => void;
}

/**
 * Editor for the selected doll slot: current pick plus the item search.
 */
export function SlotEditorPanel({ slotIndex, entry, items, onEquip, onClear, onClose }: SlotEditorPanelProps) {
  const current = entry ? items.get(itemRefKey(entry.item_id, entry.enchant_id)) : undefined;
  const usedItemIds = new Set<number>(
    entry ? [entry.item_id, ...(entry.alternates ?? []).map((a) => a.item_id)] : [],
  );

  return (
    <div className="rounded-md border border-zinc-700/60 bg-zinc-900/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-200">{slotLabel(slotIndex)}</h3>
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>

      {entry ? (
        <div className="flex items-center gap-2.5 rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2">
          <ItemIcon icon={current?.icon} quality={current?.quality ?? 1} size={34} />
          <div className="min-w-0 flex-1">
            <div className={`text-sm truncate ${getQualityTextClass(current?.quality ?? 1)}`}>
              {current?.name || `Item #${entry.item_id}`}
            </div>
            {current?.itemLevel != null && (
              <div className="text-2xs text-zinc-500 font-mono">ilvl {current.itemLevel}</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-zinc-500 hover:text-red-400"
            onClick={onClear}
          >
            Clear
          </Button>
        </div>
      ) : (
        <p className="text-xs text-zinc-500">Nothing picked for this slot yet.</p>
      )}

      <ItemPickerPanel slotIndex={slotIndex} usedItemIds={usedItemIds} onEquip={onEquip} />
    </div>
  );
}
