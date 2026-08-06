import { useQueries, useQuery } from "@tanstack/react-query";
import type { ItemTooltip, ItemSearchResult, CreatureSearchResult, EnchantmentSearchResult, ItemSetSearchResult, ItemSetDetail, SimItem } from "./typesGenerated";

export interface FetchItemTooltipParams {
  itemId: number;
  randomProperty?: number;
  enchant?: number;
}

export async function fetchItemTooltip({ itemId, randomProperty, enchant }: FetchItemTooltipParams): Promise<ItemTooltip> {
  const params = new URLSearchParams();
  if (randomProperty) params.set("random_property", randomProperty.toString());
  if (enchant) params.set("enchant", enchant.toString());
  const qs = params.toString();
  const url = `/api/v1/internal/gamedata/tooltip/item/${itemId}${qs ? `?${qs}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch item tooltip: ${response.status}`);
  }
  return response.json();
}

export function useItemTooltip(params: FetchItemTooltipParams | null) {
  return useQuery({
    queryKey: ["item-tooltip", params?.itemId, params?.randomProperty, params?.enchant],
    queryFn: () => fetchItemTooltip(params!),
    enabled: params != null && params.itemId > 0,
    staleTime: 5 * 60 * 1000, // Item data doesn't change often
    retry: false,
  });
}

async function fetchSimItem(itemId: number): Promise<SimItem> {
  const response = await fetch(`/api/v1/internal/gamedata/sim/item/${itemId}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch sim item: ${response.status}`);
  }
  return response.json();
}

/**
 * Full stat payloads for a set of items (for stat-weight scoring). One
 * query per unique item with a shared ["sim-item", id] cache key — the
 * same data the DPS sim fetches.
 */
export function useSimItems(itemIds: number[]): Map<number, SimItem> {
  const unique = [...new Set(itemIds.filter((id) => id > 0))];
  const queries = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["sim-item", id],
      queryFn: () => fetchSimItem(id),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const out = new Map<number, SimItem>();
  unique.forEach((id, i) => {
    const data = queries[i].data;
    if (data) out.set(id, data);
  });
  return out;
}

export interface SearchItemsParams {
  q: string;
  quality?: string; // comma-separated, e.g. "3,4"
  slot?: string;    // comma-separated
  class?: string;   // comma-separated
  sort?: string;
  /**
   * Allow an empty query (server requires a slot filter then) — returns
   * the top items for the slot by the chosen sort.
   */
  allowEmpty?: boolean;
}

async function fetchSearchItems(params: SearchItemsParams): Promise<ItemSearchResult[]> {
  const qs = new URLSearchParams();
  qs.set("q", params.q);
  if (params.quality) qs.set("quality", params.quality);
  if (params.slot) qs.set("slot", params.slot);
  if (params.class) qs.set("class", params.class);
  if (params.sort) qs.set("sort", params.sort);
  const response = await fetch(`/api/v1/internal/gamedata/search/items?${qs.toString()}`);
  if (!response.ok) {
    throw new Error(`Failed to search items: ${response.status}`);
  }
  return response.json();
}

export function useSearchItems(params: SearchItemsParams | null) {
  return useQuery({
    queryKey: ["gamedata", "search-items", params],
    queryFn: () => fetchSearchItems(params!),
    enabled:
      params != null &&
      (params.q.length >= 2 || (!!params.allowEmpty && params.q.length === 0 && !!params.slot)),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSearchEnchantments(q: string | null) {
  return useQuery({
    queryKey: ["gamedata", "search-enchantments", q],
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/internal/gamedata/search/enchantments?q=${encodeURIComponent(q!)}`,
      );
      if (!response.ok) throw new Error(`Failed to search enchantments: ${response.status}`);
      return response.json() as Promise<EnchantmentSearchResult[]>;
    },
    enabled: q != null && q.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export interface SearchCreaturesParams {
  q: string;
  unit_class?: number;
  sort?: string;
}

export function useSearchCreatures(params: SearchCreaturesParams | null) {
  return useQuery({
    queryKey: ["gamedata", "search-creatures", params],
    queryFn: async () => {
      const qs = new URLSearchParams();
      qs.set("q", params!.q);
      if (params!.unit_class !== undefined && params!.unit_class >= 0) qs.set("unit_class", params!.unit_class.toString());
      if (params!.sort) qs.set("sort", params!.sort);
      const response = await fetch(`/api/v1/internal/gamedata/search/creatures?${qs.toString()}`);
      if (!response.ok) throw new Error(`Failed to search creatures: ${response.status}`);
      return response.json() as Promise<CreatureSearchResult[]>;
    },
    enabled: params != null && params.q.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useSearchItemSets(q: string | null) {
  return useQuery({
    queryKey: ["gamedata", "search-item-sets", q],
    queryFn: async () => {
      const response = await fetch(`/api/v1/internal/gamedata/search/item-sets?q=${encodeURIComponent(q!)}`);
      if (!response.ok) throw new Error(`Failed to search item sets: ${response.status}`);
      return response.json() as Promise<ItemSetSearchResult[]>;
    },
    enabled: q != null && q.length >= 2,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useItemSetDetail(id: number | null) {
  return useQuery({
    queryKey: ["gamedata", "item-set-detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/v1/internal/gamedata/item-set?id=${id}`);
      if (!response.ok) throw new Error(`Failed to fetch item set: ${response.status}`);
      return response.json() as Promise<ItemSetDetail>;
    },
    enabled: id != null && id > 0,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

