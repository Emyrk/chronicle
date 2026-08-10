import { useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  GameDataRequestError,
  useItemTooltip,
  useSearchItems,
  useSimItems,
} from "@/api/gamedata";
import { ItemTooltip } from "@/components/ui/ItemTooltip/ItemTooltip";
import {
  CursorTooltip,
  type CursorPos,
} from "@/pages/ArmoryPage/overview/CursorTooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { getQualityTextClass } from "@/pages/ArmoryPage/types";
import { ItemIcon } from "@/components/ui/ItemIcon/ItemIcon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { SLOT_INVENTORY_TYPES } from "./gearListModel";
import type { GearTrendsSlot, ItemSearchResult } from "@/api/typesGenerated";
import { formatEquipRate } from "../trends/trendsModel";
import {
  evaluateItemSwapTargets,
  evaluateTargets,
  formatScore,
  scoreItem,
  type StatTarget,
  type StatWeights,
  type TargetEvaluation,
} from "./gearScoring";

const QUALITY_CHIPS = [
  { value: "", label: "All" },
  { value: "2", label: "Uncommon" },
  { value: "3", label: "Rare" },
  { value: "4", label: "Epic" },
] as const;

const SORTS = [
  { value: "item_level_desc", label: "Item level" },
  { value: "quality_desc", label: "Quality" },
  { value: "score", label: "Points" },
] as const;

interface ItemPickerPanelProps {
  /** Outfit slot index the picker is filtering for. */
  slotIndex: number;
  /** Item IDs already used in this slot (primary + alternates) for badges. */
  usedItemIds?: ReadonlySet<number>;
  /** Badge text on rows in usedItemIds; "in slot" unless overridden. */
  usedLabel?: string;
  onEquip: (item: ItemSearchResult) => void;
  /** Label for the primary row action; "Equip" unless overridden. */
  equipLabel?: string;
  /** When provided, rows also offer "Add alt". */
  onAddAlternate?: (item: ItemSearchResult) => void;
  /** Observed cohort data for this slot: popularity bars + browse list. */
  trendsSlot?: GearTrendsSlot;
  /** Active stat weights; enables per-row scores. */
  weights?: StatWeights | null;
  /** The equipped item's score, for the ± delta on each row. */
  equippedScore?: number;
  equippedItemId?: number;
  stageStats?: StatWeights;
  targets?: readonly StatTarget[];
  /**
   * Character level the results should be wearable at. Adds a level
   * filter (on by default) that the user can switch off — without it,
   * high-level quest and raid gear drowns out everything a levelling
   * character can actually equip.
   */
  characterLevel?: number;
}

/**
 * Item search for one equipment slot: debounced name search pre-filtered
 * to the slot's inventory types, quality chips, and a sort select. The
 * backend caps results at 25.
 */
export function ItemPickerPanel({
  slotIndex,
  usedItemIds,
  usedLabel,
  onEquip,
  equipLabel,
  onAddAlternate,
  trendsSlot,
  weights,
  equippedScore,
  equippedItemId,
  stageStats,
  targets,
  characterLevel,
}: ItemPickerPanelProps) {
  const [query, setQuery] = useState("");
  const [quality, setQuality] = useState("");
  const [sort, setSort] = useState<string>("item_level_desc");
  const [ignoreLevel, setIgnoreLevel] = useState(false);
  const rawQuery = query.trim();
  const debouncedQuery = useDebouncedValue(rawQuery, 175);
  // Clearing the input and the one-character guard react immediately. Only
  // meaningful name searches wait for a brief typing pause.
  const searchQuery = rawQuery.length < 2 ? rawQuery : debouncedQuery;
  const searchIsSettling = rawQuery.length >= 2 && searchQuery !== rawQuery;

  // Filtering happens in SQL, before the result cap — a client-side pass
  // over an already-capped page would leave the list nearly empty.
  const levelCeiling =
    characterLevel && !ignoreLevel ? characterLevel : undefined;

  const slotFilter = useMemo(
    () => (SLOT_INVENTORY_TYPES[slotIndex] ?? []).join(","),
    [slotIndex],
  );

  // "Points" is a client-side sort over the fetched page (the server
  // doesn't know the weights); fetch the page by item level and reorder.
  const scoreSort = sort === "score" && !!weights;
  const serverSort = sort === "score" ? "item_level_desc" : sort;

  // An empty query returns the slot's top items by the chosen sort — the
  // default picker view. One-character queries stay disabled.
  const emptyBrowse = searchQuery.length === 0;
  const search = useSearchItems(
    emptyBrowse || searchQuery.length >= 2
      ? {
          q: emptyBrowse ? "" : searchQuery,
          quality: quality || undefined,
          slot: slotFilter,
          sort: serverSort,
          maxRequiredLevel: levelCeiling,
          allowEmpty: true,
        }
      : null,
  );

  let results = emptyBrowse
    ? (search.data ?? []).slice(0, 20)
    : (search.data ?? []);
  const observedPct = new Map(
    (trendsSlot?.items ?? []).map((i) => [i.item_id, i.percent]),
  );

  // Score visible rows only when weights are active; sim payloads share
  // the ["sim-item", id] cache with the doll's scoring.
  const needsSimItems = !!weights || (!!stageStats && !!targets?.length);
  const simItems = useSimItems(
    needsSimItems
      ? [
          ...results.map((r) => r.entry),
          ...(equippedItemId ? [equippedItemId] : []),
        ]
      : [],
  );
  const scoreFor = (itemId: number): number | undefined => {
    if (!weights) return undefined;
    const sim = simItems.get(itemId);
    return sim ? scoreItem(sim, weights) : undefined;
  };
  const currentTargets =
    stageStats && targets ? evaluateTargets(stageStats, targets) : [];
  const targetResultFor = (itemId: number): TargetEvaluation[] | undefined => {
    if (!stageStats || !targets?.length) return undefined;
    if (equippedItemId && !simItems.has(equippedItemId)) return undefined;
    const candidate = simItems.get(itemId);
    if (!candidate) return undefined;
    return evaluateItemSwapTargets(
      stageStats,
      equippedItemId ? simItems.get(equippedItemId) : undefined,
      candidate,
      targets,
    );
  };
  if (scoreSort) {
    results = [...results].sort(
      (a, b) => (scoreFor(b.entry) ?? -1) - (scoreFor(a.entry) ?? -1),
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          placeholder="Search items by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pr-8"
          autoFocus
        />
        {(searchIsSettling || search.isFetching) && (
          <LoaderCircle
            className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-zinc-500"
            aria-label="Updating search results"
          />
        )}
      </div>
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
        {characterLevel != null && (
          <button
            type="button"
            onClick={() => setIgnoreLevel((prev) => !prev)}
            title={
              ignoreLevel
                ? "Only show items wearable at this level"
                : "Show items above this level too"
            }
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              ignoreLevel
                ? "border-zinc-700 text-zinc-400 hover:text-zinc-200"
                : "border-blue-500 bg-blue-500/10 text-white",
            )}
          >
            {ignoreLevel ? "Any level" : `Usable at ${characterLevel}`}
          </button>
        )}
        <div className="flex-1" />
        <select
          className="h-7 rounded border border-zinc-700 bg-zinc-900 px-1.5 text-xs text-zinc-300"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {SORTS.filter((s) => s.value !== "score" || !!weights).map((s) => (
            <option key={s.value} value={s.value}>
              Sort: {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="max-h-80 overflow-y-auto rounded border border-zinc-800 divide-y divide-zinc-800/70">
        {searchQuery.length === 1 ? (
          <p className="p-4 text-xs text-zinc-500">
            Type at least two characters to search items for this slot.
          </p>
        ) : search.isLoading ? (
          <p className="p-4 text-xs text-zinc-500">Searching…</p>
        ) : search.isError ? (
          <div className="flex items-start gap-2.5 p-4 text-xs">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-2">
              <div>
                <p className="font-medium text-zinc-300">
                  {search.error instanceof GameDataRequestError &&
                  search.error.status === 429
                    ? "Slow down for a second"
                    : "Gear search failed"}
                </p>
                <p className="mt-0.5 text-zinc-500">
                  {search.error instanceof GameDataRequestError &&
                  search.error.status === 429
                    ? "Wait a moment, then try the search again."
                    : "Please try the search again."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => void search.refetch()}
              >
                Try again
              </Button>
            </div>
          </div>
        ) : results.length === 0 ? (
          <p className="p-4 text-xs text-zinc-500">
            No matching items for this slot.
          </p>
        ) : (
          <>
            {emptyBrowse && (
              <p className="px-2.5 pt-2 pb-1 text-3xs uppercase tracking-wide text-zinc-600">
                {scoreSort
                  ? "Top items for this slot, sorted by points"
                  : `Top items for this slot by ${SORTS.find((s) => s.value === sort)?.label.toLowerCase()}`}
              </p>
            )}
            {results.map((item) => (
              <PickerRow
                key={item.entry}
                item={item}
                usedItemIds={usedItemIds}
                usedLabel={usedLabel}
                observedPct={observedPct.get(item.entry)}
                score={scoreFor(item.entry)}
                equippedScore={equippedScore}
                currentTargets={currentTargets}
                candidateTargets={targetResultFor(item.entry)}
                onEquip={onEquip}
                equipLabel={equipLabel}
                onAddAlternate={onAddAlternate}
              />
            ))}
          </>
        )}
      </div>
      {!emptyBrowse && results.length >= 25 && (
        <p className="text-2xs text-zinc-600">
          Showing the top 25 matches — refine the search to narrow down.
        </p>
      )}
    </div>
  );
}

function PickerRow({
  item,
  usedItemIds,
  usedLabel,
  observedPct,
  score,
  equippedScore,
  currentTargets,
  candidateTargets,
  onEquip,
  equipLabel,
  onAddAlternate,
}: {
  item: ItemSearchResult;
  usedItemIds?: ReadonlySet<number>;
  usedLabel?: string;
  observedPct?: number;
  score?: number;
  equippedScore?: number;
  currentTargets: TargetEvaluation[];
  candidateTargets?: TargetEvaluation[];
  onEquip: (item: ItemSearchResult) => void;
  equipLabel?: string;
  onAddAlternate?: (item: ItemSearchResult) => void;
}) {
  const delta =
    score !== undefined && equippedScore !== undefined
      ? score - equippedScore
      : undefined;
  const breaksTargets =
    candidateTargets?.filter(
      (target, index) => currentTargets[index]?.met && !target.met,
    ) ?? [];
  const unmetTargets = candidateTargets?.filter((target) => !target.met) ?? [];
  const isMobile = useIsMobile();
  const [cursor, setCursor] = useState<CursorPos | null>(null);
  // Fetch the tooltip lazily, on first hover; cached afterwards.
  const tooltip = useItemTooltip(
    cursor && !isMobile ? { itemId: item.entry } : null,
  );
  return (
    <div
      className="flex items-center gap-2.5 px-2.5 py-1.5 hover:bg-zinc-800/40"
      onMouseMove={(e) => setCursor({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setCursor(null)}
    >
      <ItemIcon icon={item.icon} quality={item.quality} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm truncate",
              getQualityTextClass(item.quality),
            )}
          >
            {item.name}
          </span>
          {usedItemIds?.has(item.entry) && (
            <span className="text-3xs uppercase tracking-wide text-blue-400 border border-blue-400/40 rounded px-1">
              {usedLabel ?? "in slot"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-2xs text-zinc-500 font-mono">
          {item.item_level > 0 && <span>ilvl {item.item_level}</span>}
          <span title="Required character level">
            req {item.required_level > 0 ? item.required_level : "—"}
          </span>
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
        {candidateTargets && unmetTargets.length > 0 && (
          <div
            className={cn(
              "mt-0.5 flex items-center gap-1 text-2xs",
              breaksTargets.length > 0 ? "text-amber-400" : "text-zinc-600",
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {breaksTargets.length > 0
              ? `Breaks ${breaksTargets.length} ${breaksTargets.length === 1 ? "target" : "targets"}`
              : `${unmetTargets.length} ${unmetTargets.length === 1 ? "target remains" : "targets remain"} unmet`}
          </div>
        )}
      </div>
      {score !== undefined && (
        <div className="text-right shrink-0 w-16">
          <div className="font-mono text-sm text-zinc-200">
            {formatScore(score)}
          </div>
          {delta !== undefined && Math.abs(delta) >= 0.05 && (
            <div
              className={cn(
                "font-mono text-2xs",
                delta > 0 ? "text-emerald-400" : "text-red-400",
              )}
            >
              {delta > 0 ? "+" : "−"}
              {formatScore(Math.abs(delta))}
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
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs"
        onClick={() => onEquip(item)}
      >
        {equipLabel ?? "Equip"}
      </Button>
      {cursor && !isMobile && tooltip.data && (
        <CursorTooltip pos={cursor}>
          <ItemTooltip item={tooltip.data} />
        </CursorTooltip>
      )}
    </div>
  );
}
