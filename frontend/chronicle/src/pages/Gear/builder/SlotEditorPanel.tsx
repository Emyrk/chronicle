import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getQualityTextClass, LEFT_SLOTS, RIGHT_SLOTS, BOTTOM_SLOTS } from "@/pages/ArmoryPage/types";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { cn } from "@/lib/utils";
import type { GearTrendsSlot, ItemSearchResult } from "@/api/typesGenerated";
import type { GearSlotEntry } from "./gearListModel";
import { itemRefKey, type HydratedItem } from "./useListItems";
import { ItemPickerPanel } from "./ItemPickerPanel";
import { AlternatesEditor } from "./AlternatesEditor";
import { EnchantPicker } from "./EnchantPicker";

const ALL_SLOTS = [...LEFT_SLOTS, ...RIGHT_SLOTS, ...BOTTOM_SLOTS];

/** Paired slots get numbers so lists and tabs stay unambiguous. */
const NUMBERED_LABELS: Record<number, string> = {
  10: "Finger 1",
  11: "Finger 2",
  12: "Trinket 1",
  13: "Trinket 2",
};

export function slotLabel(outfitIndex: number): string {
  return (
    NUMBERED_LABELS[outfitIndex] ??
    ALL_SLOTS.find((s) => s.outfitIndex === outfitIndex)?.label ??
    `Slot ${outfitIndex}`
  );
}

type EditorTab = "pick" | "alternates" | "enchant";

const TABS: { id: EditorTab; label: string }[] = [
  { id: "pick", label: "Pick item" },
  { id: "alternates", label: "Alternates & notes" },
  { id: "enchant", label: "Enchant" },
];

interface SlotEditorPanelProps {
  slotIndex: number;
  entry?: GearSlotEntry;
  items: Map<string, HydratedItem>;
  onEquip: (item: ItemSearchResult) => void;
  onAddAlternate: (item: ItemSearchResult) => void;
  onClear: () => void;
  onClose: () => void;
  onSlotNote: (note: string) => void;
  onAlternateNote: (itemId: number, note: string) => void;
  onPromoteAlternate: (itemId: number) => void;
  onRemoveAlternate: (itemId: number) => void;
  onSetEnchant: (enchantId: number | undefined) => void;
  /** Observed cohort data for this slot (popularity + enchants). */
  trendsSlot?: GearTrendsSlot;
}

/**
 * Editor for the selected doll slot: item search, alternates + notes,
 * and the enchant picker, tabbed.
 */
export function SlotEditorPanel({
  slotIndex,
  entry,
  items,
  onEquip,
  onAddAlternate,
  onClear,
  onClose,
  onSlotNote,
  onAlternateNote,
  onPromoteAlternate,
  onRemoveAlternate,
  onSetEnchant,
  trendsSlot,
}: SlotEditorPanelProps) {
  const [tab, setTab] = useState<EditorTab>("pick");
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
            <div className="text-2xs text-zinc-500 font-mono">
              {current?.itemLevel != null && <>ilvl {current.itemLevel}</>}
              {current?.tooltip?.enchantment && (
                <span className="text-quality-uncommon font-sans"> · {current.tooltip.enchantment}</span>
              )}
            </div>
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

      <div className="flex items-center gap-1 border-b border-zinc-800">
        {TABS.map((t) => {
          const disabled = t.id !== "pick" && !entry;
          return (
            <button
              key={t.id}
              type="button"
              disabled={disabled}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-2.5 py-1.5 text-xs border-b-2 -mb-px transition-colors",
                tab === t.id
                  ? "border-blue-500 text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-300",
                disabled && "opacity-40 cursor-not-allowed hover:text-zinc-500",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "pick" && (
        <ItemPickerPanel
          slotIndex={slotIndex}
          usedItemIds={usedItemIds}
          onEquip={onEquip}
          onAddAlternate={entry ? onAddAlternate : undefined}
          trendsSlot={trendsSlot}
        />
      )}
      {tab === "alternates" && entry && (
        <AlternatesEditor
          entry={entry}
          items={items}
          onSlotNote={onSlotNote}
          onAlternateNote={onAlternateNote}
          onPromote={onPromoteAlternate}
          onRemove={onRemoveAlternate}
        />
      )}
      {tab === "enchant" && entry && (
        <EnchantPicker entry={entry} onSetEnchant={onSetEnchant} observedEnchants={trendsSlot?.enchants} />
      )}
    </div>
  );
}
