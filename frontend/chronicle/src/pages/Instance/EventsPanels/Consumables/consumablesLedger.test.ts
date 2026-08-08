import { describe, expect, it } from "vitest";
import type { ConsumableUse } from "./consumables.processor";
import { buildConsumableDisambiguationMap, resolveConsumableUse } from "./consumableDisambiguation";
import {
  aggregateConsumablesLedger,
  aggregateItemBreakout,
  aggregatePlayerItemEncounters,
  formatEncounterOffset,
  formatGold,
  ledgerCoverage,
  NO_PRICES,
  summarizePlayerItemFights,
  type ConsumablePrices,
} from "./consumablesLedger";

let nextUse = 0;
function makeUse(overrides: Partial<ConsumableUse>): ConsumableUse {
  nextUse += 1;
  return {
    consumeId: `use-${nextUse}`,
    player: "p1",
    itemId: null,
    candidateItemIds: [],
    candidateEffectKind: null,
    candidateSpellId: null,
    spellId: null,
    spellName: "",
    bestConfidence: 1,
    kinds: [1],
    activeAtPullOnly: false,
    observedAtUnixMilli: 0,
    consumedAtUnixMilli: null,
    auraSpells: [],
    encounterID: "enc1",
    offsetMilli: 0,
    dateMilli: 0,
    observations: [],
    ...overrides,
  };
}

const GOLD = 10_000; // copper per gold

describe("summarizePlayerItemFights", () => {
  it("keeps boss names and combines trash encounters into one unnamed summary", () => {
    const rows = summarizePlayerItemFights([
      {
        encounterID: "trash-1",
        name: "Molten Destroyer",
        boss: false,
        uses: [{ offsetMilli: 12_000, prePull: false }],
      },
      {
        encounterID: "boss-1",
        name: "Lucifron",
        boss: true,
        uses: [{ offsetMilli: 20_000, prePull: false }],
      },
      {
        encounterID: "trash-2",
        name: "Flamewaker Protector",
        boss: false,
        uses: [
          { offsetMilli: -2_000, prePull: true },
          { offsetMilli: 8_000, prePull: false },
        ],
      },
      {
        encounterID: "boss-2",
        name: "Magmadar",
        boss: true,
        uses: [{ offsetMilli: 45_000, prePull: false }],
      },
    ]);

    expect(rows.map((row) => row.label)).toEqual([
      "Lucifron",
      "Magmadar",
      "And 2 trash fights",
    ]);
    expect(rows[2].uses).toHaveLength(3);
  });

  it("uses the singular trash-fight label", () => {
    const rows = summarizePlayerItemFights([
      {
        encounterID: "trash-1",
        name: "Core Hound Pack",
        boss: false,
        uses: [{ offsetMilli: 1_000, prePull: false }],
      },
    ]);

    expect(rows).toEqual([
      {
        key: "trash-fights",
        label: "And 1 trash fight",
        uses: [{ offsetMilli: 1_000, prePull: false }],
      },
    ]);
  });
});

describe("aggregateConsumablesLedger", () => {
  it("groups identified uses by item and counts uses, users, and encounters", () => {
    const ledger = aggregateConsumablesLedger(
      [
        makeUse({ itemId: 13512, player: "p1" }),
        makeUse({ itemId: 13512, player: "p1", encounterID: "enc2" }),
        makeUse({ itemId: 13512, player: "p2" }),
        makeUse({ itemId: 13445, player: "p1" }),
      ],
      NO_PRICES,
    );

    expect(ledger.rows).toHaveLength(2);
    const flask = ledger.rows.find((row) => row.itemId === 13512);
    expect(flask).toMatchObject({ uses: 3, users: 2, encounters: 2 });
    expect(ledger.totalUses).toBe(4);
    expect(ledger.identifiedUses).toBe(4);
    expect(ledger.ambiguousUses).toBe(0);
    expect(ledger.maxUses).toBe(3);
  });

  it("treats a single candidate as identified", () => {
    const ledger = aggregateConsumablesLedger(
      [makeUse({ candidateItemIds: [13452] })],
      NO_PRICES,
    );
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].itemId).toBe(13452);
    expect(ledger.ambiguous).toHaveLength(0);
  });

  it("buckets multi-candidate uses as ambiguous: counted in totalUses, never in gold", () => {
    const prices: ConsumablePrices = new Map([
      [13452, 20 * GOLD],
      [9187, 19 * GOLD],
      [13512, 92 * GOLD],
    ]);
    const ledger = aggregateConsumablesLedger(
      [
        makeUse({ itemId: 13512 }),
        makeUse({
          candidateItemIds: [13452, 9187],
          candidateEffectKind: "buff",
          candidateSpellId: 11334,
          spellId: 11334,
          spellName: "Elixir of the Mongoose",
          player: "p1",
        }),
        makeUse({
          candidateItemIds: [13452, 9187],
          candidateEffectKind: "buff",
          candidateSpellId: 11334,
          spellId: 11334,
          spellName: "Elixir of the Mongoose",
          player: "p2",
        }),
      ],
      prices,
    );

    expect(ledger.rows).toHaveLength(1);
    expect(ledger.ambiguous).toHaveLength(1);
    expect(ledger.ambiguous[0]).toMatchObject({
      spellName: "Elixir of the Mongoose",
      candidateItemIds: [9187, 13452],
      uses: 2,
      users: 2,
    });
    expect(ledger.totalUses).toBe(3);
    expect(ledger.ambiguousUses).toBe(2);
    // Gold only counts the identified flask, not the ambiguous elixirs.
    expect(ledger.totalCopper).toBe(92 * GOLD);
  });

  it("keeps uses with no candidates at all as an unresolved bucket", () => {
    const ledger = aggregateConsumablesLedger(
      [makeUse({ spellName: "Unknown food buff", spellId: 22730 })],
      NO_PRICES,
    );
    expect(ledger.rows).toHaveLength(0);
    expect(ledger.ambiguous).toHaveLength(1);
    expect(ledger.ambiguous[0].candidateItemIds).toEqual([]);
    expect(ledger.totalUses).toBe(1);
  });

  it("sorts by gold total, unpriced rows sink and order by uses", () => {
    const prices: ConsumablePrices = new Map([
      [1, 5 * GOLD],
      [2, 50 * GOLD],
    ]);
    const ledger = aggregateConsumablesLedger(
      [
        // item 1: 4 uses × 5g = 20g
        ...Array.from({ length: 4 }, (_, i) => makeUse({ itemId: 1, player: `p${i}` })),
        // item 2: 1 use × 50g = 50g
        makeUse({ itemId: 2 }),
        // item 3 unpriced, 3 uses; item 4 unpriced, 5 uses
        ...Array.from({ length: 3 }, (_, i) => makeUse({ itemId: 3, player: `p${i}` })),
        ...Array.from({ length: 5 }, (_, i) => makeUse({ itemId: 4, player: `p${i}` })),
      ],
      prices,
    );

    expect(ledger.rows.map((row) => row.itemId)).toEqual([2, 1, 4, 3]);
    expect(ledger.pricedRows).toBe(2);
    expect(ledger.unpricedRows).toBe(2);
    expect(ledger.totalCopper).toBe(70 * GOLD);
  });

  it("applies dataset disambiguations before bucketing", () => {
    const ambiguous = makeUse({
      candidateItemIds: [13452, 9187],
      candidateEffectKind: "buff",
      candidateSpellId: 11334,
      spellName: "Elixir of the Mongoose",
    });
    const mappings = buildConsumableDisambiguationMap([
      { effect_kind: "buff", spell_id: 11334, item_id: 13452 },
    ]);

    const ledger = aggregateConsumablesLedger(
      [ambiguous].map((u) => resolveConsumableUse(u, mappings)),
      NO_PRICES,
    );

    expect(ledger.ambiguous).toHaveLength(0);
    expect(ledger.rows).toHaveLength(1);
    expect(ledger.rows[0].itemId).toBe(13452);
  });
});

describe("aggregateItemBreakout", () => {
  it("counts uses per player for one item, most uses first", () => {
    const rows = aggregateItemBreakout(
      [
        makeUse({ itemId: 13454, player: "p1" }),
        makeUse({ itemId: 13454, player: "p2" }),
        makeUse({ itemId: 13454, player: "p2" }),
        makeUse({ itemId: 9999, player: "p3" }),
        // Single candidate resolves to its item, so it counts too.
        makeUse({ candidateItemIds: [13454], player: "p4" }),
        // Multi-candidate stays ambiguous and is excluded.
        makeUse({ candidateItemIds: [13454, 9187], player: "p5" }),
      ],
      13454,
    );

    expect(rows).toEqual([
      { player: "p2", uses: 2 },
      { player: "p1", uses: 1 },
      { player: "p4", uses: 1 },
    ]);
  });
});

describe("aggregatePlayerItemEncounters", () => {
  it("groups one player's item uses by encounter with sorted offsets", () => {
    const rows = aggregatePlayerItemEncounters(
      [
        makeUse({ itemId: 13446, player: "p1", encounterID: "enc1", offsetMilli: 65_000 }),
        makeUse({ itemId: 13446, player: "p1", encounterID: "enc1", offsetMilli: 5_000 }),
        makeUse({ itemId: 13446, player: "p1", encounterID: "enc2", offsetMilli: -2_000 }),
        makeUse({ itemId: 13446, player: "p1", encounterID: "enc3", offsetMilli: 1_000, activeAtPullOnly: true }),
        // Other players and other items are excluded.
        makeUse({ itemId: 13446, player: "p2", encounterID: "enc1" }),
        makeUse({ itemId: 9999, player: "p1", encounterID: "enc1" }),
      ],
      "p1",
      13446,
    );

    expect(rows).toEqual([
      {
        encounterID: "enc1",
        uses: [
          { offsetMilli: 5_000, prePull: false },
          { offsetMilli: 65_000, prePull: false },
        ],
      },
      { encounterID: "enc2", uses: [{ offsetMilli: -2_000, prePull: true }] },
      { encounterID: "enc3", uses: [{ offsetMilli: 1_000, prePull: true }] },
    ]);
  });
});

describe("formatEncounterOffset", () => {
  it("formats in-fight offsets and pre-pull uses", () => {
    expect(formatEncounterOffset({ offsetMilli: 5_000, prePull: false })).toBe("0:05");
    expect(formatEncounterOffset({ offsetMilli: 65_000, prePull: false })).toBe("1:05");
    expect(formatEncounterOffset({ offsetMilli: 1_000, prePull: true })).toBe("pre-pull");
  });
});

describe("ledgerCoverage", () => {
  const identified = (itemId: number) => makeUse({ itemId });

  it("reports the no-price-data layout when nothing is priced", () => {
    const ledger = aggregateConsumablesLedger([identified(1), identified(2)], NO_PRICES);
    expect(ledgerCoverage(ledger)).toEqual({ label: "no price data", tone: "muted", showGold: false });
  });

  it("qualifies partial pricing where the gold total is read", () => {
    const ledger = aggregateConsumablesLedger(
      [identified(1), identified(2), identified(3)],
      new Map([[1, GOLD]]),
    );
    expect(ledgerCoverage(ledger)).toEqual({ label: "2 of 3 unpriced", tone: "warn", showGold: true });
  });

  it("reports full pricing", () => {
    const ledger = aggregateConsumablesLedger(
      [identified(1), identified(2)],
      new Map([
        [1, GOLD],
        [2, GOLD],
      ]),
    );
    expect(ledgerCoverage(ledger)).toEqual({ label: "2 of 2 priced", tone: "ok", showGold: true });
  });
});

describe("formatGold", () => {
  it("formats gold-led amounts", () => {
    expect(formatGold(92 * GOLD)).toBe("92g");
    expect(formatGold(1235 * GOLD)).toBe("1,235g");
    expect(formatGold(15_000)).toBe("1.5g");
    expect(formatGold(20_000)).toBe("2g");
  });

  it("falls back to silver and copper below one gold", () => {
    expect(formatGold(500)).toBe("5s");
    expect(formatGold(42)).toBe("42c");
  });
});
