import { useQuery } from "@tanstack/react-query";
import type { ItemTooltip } from "./typesGenerated";

export interface FetchItemTooltipParams {
  itemId: number;
  randomProperty?: number;
  enchant?: number;
}

async function fetchItemTooltip({ itemId, randomProperty, enchant }: FetchItemTooltipParams): Promise<ItemTooltip> {
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
