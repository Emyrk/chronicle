import { describe, expect, it } from "vitest";
import type { ConsumableUse } from "./consumables.processor";
import {
  buildConsumableComparisonColumns,
  filterConsumableUses,
  type ConsumableCount,
  type PlayerConsumablesTotal,
} from "./consumablesTotalLogic";

function consume(key: string, count: number): ConsumableCount {
  return {
    key,
    count,
    itemId: Number(key.replace("item:", "")),
    candidateItemIds: [],
    sources: [],
  };
}

function consumableUse(overrides: Partial<ConsumableUse> = {}): ConsumableUse {
  return {
    consumeId: "use-1",
    player: "player-1",
    itemId: 20008,
    candidateItemIds: [],
    candidateEffectKind: null,
    candidateSpellId: null,
    spellId: 11359,
    spellName: "Restorative Potion",
    bestConfidence: 1,
    kinds: [],
    activeAtPullOnly: false,
    observedAtUnixMilli: 0,
    consumedAtUnixMilli: 0,
    auraSpells: [],
    encounterID: "encounter-1",
    offsetMilli: 0,
    dateMilli: 0,
    observations: [],
    ...overrides,
  };
}

describe("filterConsumableUses", () => {
  const uses = [
    consumableUse(),
    consumableUse({ consumeId: "use-2", itemId: 13444, spellName: "Major Mana Potion" }),
  ];

  it("matches resolved item names fuzzily", () => {
    const itemNames = new Map([
      [20008, "Living Action Potion"],
      [13444, "Major Mana Potion"],
    ]);

    expect(filterConsumableUses(uses, "lvact", itemNames).map((use) => use.consumeId)).toEqual(["use-1"]);
  });

  it("matches caller-provided row values such as player and encounter names", () => {
    const additionalValues = (use: ConsumableUse) => use.consumeId === "use-1"
      ? ["Kel'Thuzad", "Steven"]
      : ["Nefarian", "Alex"];

    expect(filterConsumableUses(uses, "stev", new Map(), additionalValues).map((use) => use.consumeId)).toEqual(["use-1"]);
    expect(filterConsumableUses(uses, "nefar", new Map(), additionalValues).map((use) => use.consumeId)).toEqual(["use-2"]);
  });
});

describe("buildConsumableComparisonColumns", () => {
  it("deduplicates consumables across players and orders the most-used columns first", () => {
    const rows: PlayerConsumablesTotal[] = [
      {
        playerId: "p1",
        total: 4,
        consumes: [consume("item:1", 3), consume("item:2", 1)],
      },
      {
        playerId: "p2",
        total: 5,
        consumes: [consume("item:2", 4), consume("item:3", 1)],
      },
    ];

    expect(buildConsumableComparisonColumns(rows).map((column) => column.key)).toEqual([
      "item:2",
      "item:1",
      "item:3",
    ]);
  });

  it("uses the consumable key as a stable tie breaker", () => {
    const rows: PlayerConsumablesTotal[] = [
      {
        playerId: "p1",
        total: 2,
        consumes: [consume("item:20", 1), consume("item:10", 1)],
      },
    ];

    expect(buildConsumableComparisonColumns(rows).map((column) => column.key)).toEqual([
      "item:10",
      "item:20",
    ]);
  });
});
