import { describe, expect, it } from "vitest";
import { consumablePriceItemIDs, instanceItemPricesToMap } from "./useConsumablePrices";
import type { ConsumableUse } from "./consumables.processor";

function consumableUse(overrides: Partial<ConsumableUse>): ConsumableUse {
  return {
    consumeId: "use-1",
    player: "player-1",
    itemId: null,
    candidateItemIds: [],
    candidateEffectKind: null,
    candidateSpellId: null,
    spellId: null,
    spellName: "",
    bestConfidence: 0,
    kinds: [],
    activeAtPullOnly: false,
    observedAtUnixMilli: 0,
    consumedAtUnixMilli: null,
    auraSpells: [],
    encounterID: "encounter-1",
    offsetMilli: 0,
    dateMilli: 0,
    observations: [],
    ...overrides,
  };
}

describe("consumable price item IDs", () => {
  it("includes direct and single-candidate item identities", () => {
    expect(consumablePriceItemIDs([
      consumableUse({ itemId: 20008 }),
      consumableUse({ consumeId: "use-2", candidateItemIds: [61181] }),
      consumableUse({ consumeId: "use-3", candidateItemIds: [10, 20] }),
    ])).toEqual([20008, 61181]);
  });
});

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
