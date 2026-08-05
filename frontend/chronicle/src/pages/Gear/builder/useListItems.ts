import { useQueries } from "@tanstack/react-query";
import type { ItemTooltip } from "@/api/typesGenerated";
import { fetchItemTooltip } from "@/api/gamedata";

export interface ItemRef {
  itemId: number;
  enchantId?: number;
}

export interface HydratedItem {
  itemId: number;
  enchantId?: number;
  name: string;
  icon: string;
  quality: number;
  itemLevel: number | null;
  /** Full tooltip payload (includes resolved enchant name), when loaded. */
  tooltip?: ItemTooltip;
  isLoading: boolean;
}

export function itemRefKey(itemId: number, enchantId?: number): string {
  return `${itemId}:${enchantId ?? 0}`;
}

/**
 * Hydrates every item referenced by a gear list with tooltip metadata
 * (name, icon, quality, item level, enchant text). One query per unique
 * (item, enchant) pair; query keys match useItemTooltip so the cache is
 * shared with the armory paperdoll and WoWDB pages.
 *
 * This is the single chokepoint for list-item fetching: if fan-out ever
 * hurts, swap the internals for a batch endpoint without touching callers.
 */
export function useListItems(refs: ItemRef[]): Map<string, HydratedItem> {
  const unique = new Map<string, ItemRef>();
  for (const ref of refs) {
    if (ref.itemId > 0) unique.set(itemRefKey(ref.itemId, ref.enchantId), ref);
  }
  const list = [...unique.values()];

  const queries = useQueries({
    queries: list.map((ref) => ({
      queryKey: ["item-tooltip", ref.itemId, undefined, ref.enchantId],
      queryFn: () => fetchItemTooltip({ itemId: ref.itemId, enchant: ref.enchantId }),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  const out = new Map<string, HydratedItem>();
  list.forEach((ref, i) => {
    const data = queries[i].data;
    out.set(itemRefKey(ref.itemId, ref.enchantId), {
      itemId: ref.itemId,
      enchantId: ref.enchantId,
      name: data?.name ?? "",
      icon: data?.icon ?? "",
      quality: data?.quality ?? 1,
      itemLevel: data?.item_level ?? null,
      tooltip: data,
      isLoading: queries[i].isLoading,
    });
  });
  return out;
}
