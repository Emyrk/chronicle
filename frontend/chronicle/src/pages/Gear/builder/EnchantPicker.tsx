import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useItemTooltip } from "@/api/gamedata";
import type { GearTrendsEnchant } from "@/api/typesGenerated";
import { formatEquipRate } from "../trends/trendsModel";
import type { GearSlotEntry } from "./gearListModel";

interface EnchantPickerProps {
  entry: GearSlotEntry;
  onSetEnchant: (enchantId: number | undefined) => void;
  /** Enchants observed on logged players for this slot. */
  observedEnchants?: readonly GearTrendsEnchant[];
}

/**
 * Per-slot enchant selection by enchant ID. Only names exist in the game
 * data (no stat decomposition), so enchants are display-only and never
 * affect scores. The chosen ID is validated by resolving the item tooltip
 * with the enchant applied.
 */
export function EnchantPicker({ entry, onSetEnchant, observedEnchants }: EnchantPickerProps) {
  const [draft, setDraft] = useState("");
  const draftId = parseInt(draft, 10);
  const validDraft = Number.isInteger(draftId) && draftId > 0;

  // Resolve the current enchant's display name through the tooltip endpoint.
  const current = useItemTooltip(
    entry.enchant_id ? { itemId: entry.item_id, enchant: entry.enchant_id } : null,
  );
  // Preview the drafted enchant before applying.
  const preview = useItemTooltip(
    validDraft ? { itemId: entry.item_id, enchant: draftId } : null,
  );

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
                onClick={() => onSetEnchant(e.enchant_id)}
                className="px-2 py-0.5 rounded-full text-2xs border border-zinc-700 text-quality-uncommon hover:border-zinc-500 transition-colors"
              >
                {e.name} <span className="text-zinc-500 font-mono">{formatEquipRate(e.percent)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!validDraft) return;
          onSetEnchant(draftId);
          setDraft("");
        }}
      >
        <div className="text-2xs uppercase tracking-wide text-zinc-500">Set enchant by ID</div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            placeholder="Enchant ID"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-7 w-32 text-xs font-mono"
          />
          <Button type="submit" size="sm" className="h-7 text-xs" disabled={!validDraft}>
            Apply
          </Button>
        </div>
        {validDraft && (
          <p className="text-2xs text-zinc-500">
            {preview.isLoading
              ? "Resolving…"
              : preview.data?.enchantment
                ? `Resolves to: ${preview.data.enchantment}`
                : "Unknown enchant ID for this dataset."}
          </p>
        )}
        <p className="text-2xs text-zinc-600">
          Enchants are shown by name only and do not affect scores. Observed
          per-slot enchant suggestions arrive with gear trends.
        </p>
      </form>
    </div>
  );
}
