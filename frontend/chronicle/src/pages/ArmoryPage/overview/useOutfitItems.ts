import { useQueries } from "@tanstack/react-query";
import type { ArmoryGearSnapshot, ArmoryPlayer, ItemTooltip } from "@/api/typesGenerated";
import { fetchItemTooltip } from "@/api/gamedata";

/** Paperdoll display order for compact views (shirt/tabard excluded). */
export const STRIP_ORDER = [0, 1, 2, 14, 4, 8, 9, 5, 6, 7, 10, 11, 12, 13, 15, 16, 17];

export interface OutfitItem {
  itemId: number;
  enchantId?: number;
  name: string;
  icon: string;
  quality: number;
  itemLevel: number | null;
  tooltip?: ItemTooltip;
}

/**
 * The equipped outfit with item metadata resolved. Some outfits store only
 * item IDs; the tooltip endpoint fills in icon, quality, and item level, and
 * resolves the enchant display name for hover tooltips. Query keys match
 * useItemTooltip so the cache is shared with the paperdoll tab.
 */
export function useOutfitItems(
  player: ArmoryPlayer,
  latestSnapshot?: ArmoryGearSnapshot,
): { items: OutfitItem[]; avgIlvl: number | null } {
  const gear = STRIP_ORDER.map((i) => player.gear[i]).filter((item) => item.item_id > 0);

  const tooltips = useQueries({
    queries: gear.map((item) => ({
      queryKey: ["item-tooltip", item.item_id, undefined, item.enchant_id],
      queryFn: () => fetchItemTooltip({ itemId: item.item_id, enchant: item.enchant_id }),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  const items = gear.map((item, i) => ({
    itemId: item.item_id,
    enchantId: item.enchant_id,
    name: item.item_name || tooltips[i].data?.name || "",
    icon: item.item_icon || tooltips[i].data?.icon || "",
    quality: item.item_quality ?? tooltips[i].data?.quality ?? 1,
    itemLevel: item.item_level ?? tooltips[i].data?.item_level ?? null,
    tooltip: tooltips[i].data,
  }));

  const known = items.filter((m) => m.itemLevel != null);
  const avgIlvl =
    known.length > 0
      ? known.reduce((sum, m) => sum + m.itemLevel!, 0) / known.length
      : (latestSnapshot?.avg_ilvl ?? null);

  return { items, avgIlvl };
}
