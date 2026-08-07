import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useItemTooltip, useSearchEnchantments } from "@/api/gamedata";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { GearTrendsEnchant } from "@/api/typesGenerated";
import { formatEquipRate } from "../trends/trendsModel";
import { SLOT_INVENTORY_TYPES, type GearSlotEntry } from "./gearListModel";

interface EnchantPickerProps {
  slotIndex: number;
  entry: GearSlotEntry;
  onSetEnchant: (enchantId: number | undefined) => void;
  /** Enchants observed on logged players for this slot. */
  observedEnchants?: readonly GearTrendsEnchant[];
}

/**
 * Per-slot enchant selection: valid enchants for the slot are listed
 * up front (derived from the spells that apply them), narrowed by name
 * search; observed quick-picks come first. Only names exist in the game
 * data (no stat decomposition), so enchants never affect scores.
 */
export function EnchantPicker({ slotIndex, entry, onSetEnchant, observedEnchants }: EnchantPickerProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);
  const invTypes = SLOT_INVENTORY_TYPES[slotIndex];
  const search = useSearchEnchantments(debouncedQuery, invTypes);

  // Resolve the current enchant's display name through the tooltip endpoint.
  const current = useItemTooltip(
    entry.enchant_id ? { itemId: entry.item_id, enchant: entry.enchant_id } : null,
  );

  const apply = (enchantId: number) => {
    onSetEnchant(enchantId);
    setQuery("");
  };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-2xs uppercase tracking-wide text-zinc-500 mb-1">Current enchant</div>
        {entry.enchant_id ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-quality-uncommon">
              {current.data?.enchantment || `Enchant #${entry.enchant_id}`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-2xs text-zinc-500 hover:text-red-400"
              onClick={() => onSetEnchant(undefined)}
            >
              Remove
            </Button>
          </div>
        ) : (
          <p className="text-xs text-zinc-600">No enchant on this slot.</p>
        )}
      </div>

      {observedEnchants && observedEnchants.length > 0 && (
        <div className="space-y-1">
          <div className="text-2xs uppercase tracking-wide text-zinc-500">
            Observed on logged players
          </div>
          <div className="flex flex-wrap gap-1.5">
            {observedEnchants.map((e) => (
              <button
                key={e.enchant_id}
                type="button"
                onClick={() => apply(e.enchant_id)}
                className="px-2 py-0.5 rounded-full text-2xs border border-zinc-700 text-quality-uncommon hover:border-zinc-500 transition-colors"
              >
                {e.name} <span className="text-zinc-500 font-mono">{formatEquipRate(e.percent)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-2xs uppercase tracking-wide text-zinc-500">
          {debouncedQuery ? "Search enchants" : "Valid for this slot"}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-zinc-500" />
          <Input
            className="h-7 pl-6 text-xs"
            placeholder="Filter enchants by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {(debouncedQuery.length >= 2 || !!invTypes?.length) && (
          <div className="max-h-48 overflow-y-auto rounded border border-zinc-800 divide-y divide-zinc-800/70">
            {search.isLoading ? (
              <p className="p-2.5 text-xs text-zinc-500">Searching…</p>
            ) : (search.data ?? []).length === 0 ? (
              <p className="p-2.5 text-xs text-zinc-500">No enchants match.</p>
            ) : (
              (search.data ?? []).map((enchant) => (
                <button
                  key={enchant.id}
                  type="button"
                  className="flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left hover:bg-zinc-800/60"
                  onClick={() => apply(enchant.id)}
                >
                  <span className="text-xs text-quality-uncommon">{enchant.name}</span>
                  <span className="text-3xs text-zinc-600 font-mono">#{enchant.id}</span>
                </button>
              ))
            )}
          </div>
        )}
        <p className="text-2xs text-zinc-600">
          Enchants are shown by name only and do not affect scores.
        </p>
      </div>
    </div>
  );
}
