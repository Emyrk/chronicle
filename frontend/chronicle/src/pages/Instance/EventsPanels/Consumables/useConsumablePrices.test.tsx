import { describe, expect, it } from "vitest";
import { instanceItemPricesToMap } from "./useConsumablePrices";

describe("consumable price response mapping", () => {
  it("keeps priced items and excludes unavailable items", () => {
    const prices = instanceItemPricesToMap({
      available: true,
      requested_date: "2026-08-20",
      prices: [
        { item_id: 4306, price_copper: 542, observed_date: "2026-08-26", future_fallback: true },
        { item_id: 4338, future_fallback: false },
      ],
    });

    expect(prices).toEqual(new Map([[4306, 542]]));
  });
});
