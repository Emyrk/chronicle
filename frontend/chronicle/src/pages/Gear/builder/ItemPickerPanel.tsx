import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useSearchItems, useSimItems } from "@/api/gamedata";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SLOT_INVENTORY_TYPES } from "./gearListModel";
import type { GearTrendsSlot, ItemSearchResult } from "@/api/typesGenerated";
import { formatEquipRate } from "../trends/trendsModel";
import { formatScore, scoreItem, type StatWeights } from "./gearScoring";

const QUALITY_CHIPS = [
  { value: "", label: "All" },
  { value: "2", label: "Uncommon" },
  { value: "3", label: "Rare" },
  { value: "4", label: "Epic" },
] as const;

const SORTS = [
  { value: "item_level_desc", label: "Item level" },
  { value: "quality_desc", label: "Quality" },
] as const;

interface ItemPickerPanelProps {
  /** Outfit slot index the picker is filtering for. */
  slotIndex: number;
  /** Item IDs already used in this slot (primary + alternates) for badges. */
  usedItemIds?: ReadonlySet<number>;
  onEquip: (item: ItemSearchResult) => void;
  /** When provided, rows also offer "Add alt". */
  onAddAlternate?: (item: ItemSearchResult) => void;
  /** Observed cohort data for this slot: popularity bars + browse list. */
  trendsSlot?: GearTrendsSlot;
  /** Active stat weights; enables per-row scores. */
  weights?: StatWeights | null;
  /** The equipped item's score, for the ± delta on each row. */
  equippedScore?: number;
}

/**
 * Item search for one equipment slot: debounced name search pre-filtered
 * to the slot's inventory types, quality chips, and a sort select. The
 * backend caps results at 25.
 */
export function ItemPickerPanel({
  slotIndex,
  usedItemIds,
  onEquip,
  onAddAlternate,
  trendsSlot,
  weights,
  equippedScore,
}: ItemPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState("");
  const [sort, setSort] = useState<string>("item_level_desc");
  const debouncedQuery = useDebouncedValue(query.trim(), 250);

  const slotFilter = useMemo(
    () => (SLOT_INVENTORY_TYPES[slotIndex] ?? []).join(","),
    [slotIndex],
  );

  // An empty query returns the slot's top items by the chosen sort — the
  // default picker view. One-character queries stay disabled.
  const emptyBrowse = debouncedQuery.length === 0;
  const search = useSearchItems(
    emptyBrowse || debouncedQuery.length >= 2
      ? { q: emptyBrowse ? "" : debouncedQuery, quality: quality || undefined, slot: slotFilter, sort, allowEmpty: true }
      : null,
  );

  const results = emptyBrowse ? (search.data ?? []).slice(0, 20) : (search.data ?? []);
  const observedPct = new Map((trendsSlot?.items ?? []).map((i) => [i.item_id, i.percent]));

  // Score visible rows only when weights are active; sim payloads share
  // the ["sim-item", id] cache with the doll's scoring.
  const simItems = useSimItems(weights ? results.map((r) => r.entry) : []);
  const scoreFor = (itemId: number): number | undefined => {
    if (!weights) return undefined;
    const sim = simItems.get(itemId);
    return sim ? scoreItem(sim, weights) : undefined;
  };

  return (
    <div className="space-y-2">
      <Input
        placeholder="Search items by name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {QUALITY_CHIPS.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setQuality(chip.value)}
            className={cn(
              "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
              quality === chip.value
                ? "border-blue-500 bg-blue-500/10 text-white"
                : "border-zinc-700 text-zinc-400 hover:text-zinc-200",
            )}
          >
            {chip.label}
          </button>
        ))}
        <div className="flex-1" />
        <select
          className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-h-80 overflow-y-auto rounded border border-zinc-800 divide-y divide-zinc-800/70">
        {debouncedQuery.length === 1 ? (
          <p className="p-4 text-xs text-zinc-500">
            Type at least two characters to search items for this slot.
          </p>
        ) : search.isLoading ? (
          <p className="p-4 text-xs text-zinc-500">Searching…</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">No matching items for this slot.</p>
        ) : (
          <>
            {emptyBrowse && (
              <p className="px-2.5 pt-2 pb-1 text-3xs uppercase tracking-wide text-zinc-600">
                Top items for this slot by {SORTS.find((s) => s.value === sort)?.label.toLowerCase()}
              </p>
            )}
            {results.map((item) => (
              <PickerRow
                key={item.entry}
                item={item}
                usedItemIds={usedItemIds}
                observedPct={observedPct.get(item.entry)}
                score={scoreFor(item.entry)}
                equippedScore={equippedScore}
                onEquip={onEquip}
                onAddAlternate={onAddAlternate}
              />
            ))}
          </>
        )}
      </div>
      {!emptyBrowse && results.length >= 25 && (
        <p className="text-2xs text-zinc-600">Showing the top 25 matches — refine the search to narrow down.</p>
      )}
    </div>
  );
}

function PickerRow({
  item,
  usedItemIds,
  observedPct,
  score,
  equippedScore,
  onEquip,
  onAddAlternate,
}: {
  item: ItemSearchResult;
  usedItemIds?: ReadonlySet<number>;
  observedPct?: number;
  score?: number;
  equippedScore?: number;
  onEquip: (item: ItemSearchResult) => void;
  onAddAlternate?: (item: ItemSearchResult) => void;
}) {
  const delta = score !== undefined && equippedScore !== undefined ? score - equippedScore : undefined;
  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-zinc-800/40">
      <ItemIcon icon={item.icon} quality={item.quality} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("text-sm truncate", getQualityTextClass(item.quality))}>
            {item.name}
          </span>
          {usedItemIds?.has(item.entry) && (
            <span className="text-3xs uppercase tracking-wide text-blue-400 border border-blue-400/40 rounded px-1">
              in slot
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-2xs text-zinc-500 font-mono">
          {item.item_level > 0 && <span>ilvl {item.item_level}</span>}
          {observedPct !== undefined && (
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1 w-10 rounded bg-zinc-800 overflow-hidden align-middle">
                <span
                  className="block h-1 bg-blue-500/70"
                  style={{ width: `${Math.min(100, observedPct)}%` }}
                />
              </span>
              {formatEquipRate(observedPct)} observed
            </span>
          )}
        </div>
      </div>
      {score !== undefined && (
        <div className="text-right shrink-0 w-16">
          <div className="font-mono text-sm text-zinc-200">{formatScore(score)}</div>
          {delta !== undefined && Math.abs(delta) >= 0.05 && (
            <div
              className={cn(
                "font-mono text-2xs",
                delta > 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {delta > 0 ? "+" : "−"}{formatScore(Math.abs(delta))}
            </div>
          )}
        </div>
      )}
      {onAddAlternate && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-zinc-400"
          onClick={() => onAddAlternate(item)}
        >
          Add alt
        </Button>
      )}
      <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => onEquip(item)}>
        Equip
      </Button>
    </div>
  );
}
