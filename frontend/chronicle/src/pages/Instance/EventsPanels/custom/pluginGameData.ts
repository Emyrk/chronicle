import type { ItemMetadataResponse } from "@/api/typesGenerated";
import type { PluginItemMetadataV1 } from "./pluginTypes";

const MAX_ITEM_METADATA_IDS = 512;

function normalizeItemIds(itemIds: number[]): number[] {
  const normalized = [...new Set(itemIds.filter((itemId) => Number.isInteger(itemId) && itemId > 0))]
    .sort((a, b) => a - b);
  if (normalized.length > MAX_ITEM_METADATA_IDS) {
    throw new Error(`Custom panel requested more than ${MAX_ITEM_METADATA_IDS} item IDs.`);
  }
  return normalized;
}

export async function fetchPluginItemMetadata(
  itemIds: number[],
  signal: AbortSignal,
): Promise<PluginItemMetadataV1[]> {
  const normalized = normalizeItemIds(itemIds);
  if (normalized.length === 0) return [];

  const response = await fetch("/api/v1/internal/gamedata/items/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ item_ids: normalized }),
    signal,
  });
  if (!response.ok) throw new Error(`Item metadata request failed (${response.status}).`);
  const result = await response.json() as ItemMetadataResponse;
  return result.items.map((item) => ({ ...item }));
}

export function createPluginItemMetadataBroker(signal: AbortSignal) {
  const cache = new Map<number, PluginItemMetadataV1>();
  return async (itemIds: number[]): Promise<PluginItemMetadataV1[]> => {
    const normalized = normalizeItemIds(itemIds);
    const missing = normalized.filter((itemId) => !cache.has(itemId));
    if (missing.length > 0) {
      for (const item of await fetchPluginItemMetadata(missing, signal)) cache.set(item.entry, item);
    }
    return normalized.flatMap((itemId) => {
      const item = cache.get(itemId);
      return item ? [item] : [];
    });
  };
}
