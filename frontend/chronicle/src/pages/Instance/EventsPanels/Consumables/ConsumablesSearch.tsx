import { useQueries } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { fetchItemTooltip } from "@/api/gamedata";
import type { ConsumableUse } from "./consumables.processor";
import { filterConsumableUses, itemIdentity } from "./consumablesTotalLogic";

/**
 * Fuzzy-filter resolved uses by item name (or id). Item names come from lazily
 * fetched tooltips, so they load on the first keystroke. Callers may add other
 * row-specific values such as player or encounter names.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useFilteredUses(
  uses: ConsumableUse[],
  filter: string,
  additionalSearchValues?: (use: ConsumableUse) => Iterable<string>,
): ConsumableUse[] {
  const itemIds = [
    ...new Set(
      uses.flatMap((use) => {
        const identified = itemIdentity(use).itemId;
        return identified !== null ? [identified] : use.candidateItemIds;
      }),
    ),
  ];
  const itemQueries = useQueries({
    queries: itemIds.map((itemId) => ({
      queryKey: ["item-tooltip", itemId, undefined, undefined],
      queryFn: () => fetchItemTooltip({ itemId }),
      enabled: filter.trim().length > 0,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  const query = filter.trim();
  if (!query) return uses;

  const itemNames = new Map<number, string>();
  itemIds.forEach((itemId, index) => {
    const name = itemQueries[index]?.data?.name;
    if (name) itemNames.set(itemId, name);
  });

  return filterConsumableUses(uses, query, itemNames, additionalSearchValues);
}

export function LedgerFilterInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="relative block shrink-0" data-demo-consumables-search>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search consumes..."
        aria-label="Search consumables"
        className="h-7 w-full rounded border border-border bg-background/70 pl-8 pr-8 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-ring"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Clear consumables filter"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </label>
  );
}
