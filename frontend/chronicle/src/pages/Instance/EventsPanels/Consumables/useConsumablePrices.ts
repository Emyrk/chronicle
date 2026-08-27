import { useMemo } from "react";
import { useInstanceItemPrices } from "@/api/queries";
import type { InstanceItemPricesResponse } from "@/api/typesGenerated";
import type { ConsumableUse } from "./consumables.processor";
import type { ConsumablePrices } from "./consumablesLedgerLogic";
import { itemIdentity } from "./consumablesTotalLogic";

export function instanceItemPricesToMap(data: InstanceItemPricesResponse | undefined): ConsumablePrices {
  return new Map(
    (data?.prices ?? []).flatMap((price) => price.price_copper === undefined ? [] : [[price.item_id, price.price_copper] as const]),
  );
}

export function consumablePriceItemIDs(uses: ConsumableUse[]): number[] {
  return [...new Set(uses.flatMap((use) => {
    const itemId = itemIdentity(use).itemId;
    return itemId === null ? [] : [itemId];
  }))].sort((a, b) => a - b);
}

export function useConsumablePrices(instanceId: string, uses: ConsumableUse[]): ConsumablePrices {
  const itemIds = useMemo(() => consumablePriceItemIDs(uses), [uses]);
  const { data } = useInstanceItemPrices(instanceId, itemIds);
  return useMemo(() => instanceItemPricesToMap(data), [data]);
}
