import { useMemo } from "react";
import { useInstanceItemPrices } from "@/api/queries";
import type { InstanceItemPricesResponse } from "@/api/typesGenerated";
import type { ConsumableUse } from "./consumables.processor";
import type { ConsumablePrices } from "./consumablesLedgerLogic";

export function instanceItemPricesToMap(data: InstanceItemPricesResponse | undefined): ConsumablePrices {
  return new Map(
    (data?.prices ?? []).flatMap((price) => price.price_copper === undefined ? [] : [[price.item_id, price.price_copper] as const]),
  );
}

export function useConsumablePrices(instanceId: string, uses: ConsumableUse[]): ConsumablePrices {
  const itemIds = useMemo(
    () => [...new Set(uses.flatMap((use) => use.itemId === null ? [] : [use.itemId]))].sort((a, b) => a - b),
    [uses],
  );
  const { data } = useInstanceItemPrices(instanceId, itemIds);
  return useMemo(() => instanceItemPricesToMap(data), [data]);
}
