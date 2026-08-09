import { describe, expect, it } from "vitest";
import {
  MAX_POOL_ITEMS,
  PROGRESSION_PAYLOAD_VERSION,
  SLOT,
  addPoolItem,
  addProgressionStage,
  averageEquippedItemLevel,
  computeEquippedAtLevel,
  derivedAverageItemLevel,
  derivedStage,
  itemFitsSlot,
  levelCapForFlavor,
  nextUpgradesAfter,
  progressionColumns,
  parseProgressionPayload,
  removePoolItem,
  renameProgressionStage,
  setPoolItemEnchant,
  setPoolItemNote,
  slotsForInventoryType,
  snapshotStageFromDerived,
  stageAverageItemLevel,
  upgradeLevels,
  type PoolItemStats,
  type ProgressionPayload,
  setProgressionStageLevel,
} from "./progressionModel";

/** Terse pool-item builder: inventory type, required level, item level. */
function item(
  item_id: number,
  inventory_type: number,
  required_level: number,
  item_level: number,
): PoolItemStats {
  return { item_id, inventory_type, required_level, item_level };
}

const INV = {
  head: 1,
  neck: 2,
  chest: 5,
  robe: 20,
  finger: 11,
  trinket: 12,
  oneHand: 13,
  shield: 14,
  twoHand: 17,
  mainHand: 21,
  offHand: 22,
  bow: 15,
  bag: 18,
} as const;

describe("levelCapForFlavor", () => {
  it("maps dataset flavor tags to the expansion's cap", () => {
    expect(levelCapForFlavor(["wrath"])).toBe(80);
    expect(levelCapForFlavor(["tbc"])).toBe(70);
    expect(levelCapForFlavor(["vanilla"])).toBe(60);
    expect(levelCapForFlavor([])).toBe(60);
  });

  it("prefers the newest flavor when a dataset is tagged with several", () => {
    expect(levelCapForFlavor(["vanilla", "tbc", "wrath"])).toBe(80);
  });
});

describe("computeEquippedAtLevel", () => {
  it("ignores items the character cannot wear yet", () => {
    const pool = [item(1, INV.head, 20, 30), item(2, INV.head, 40, 50)];
    expect(computeEquippedAtLevel(pool, 19)).toEqual({});
    expect(computeEquippedAtLevel(pool, 20)[SLOT.head]).toBe(1);
    expect(computeEquippedAtLevel(pool, 40)[SLOT.head]).toBe(2);
  });

  it("prefers the latest-unlocked item, then the higher item level", () => {
    const pool = [
      item(1, INV.head, 30, 60), // unlocks later but weaker
      item(2, INV.head, 20, 80),
    ];
    expect(computeEquippedAtLevel(pool, 60)[SLOT.head]).toBe(1);

    const sameLevel = [item(1, INV.head, 30, 60), item(2, INV.head, 30, 80)];
    expect(computeEquippedAtLevel(sameLevel, 60)[SLOT.head]).toBe(2);
  });

  it("breaks remaining ties by item ID so the derivation is stable", () => {
    const pool = [item(9, INV.head, 30, 60), item(4, INV.head, 30, 60)];
    expect(computeEquippedAtLevel(pool, 60)[SLOT.head]).toBe(4);
  });

  it("fills both finger and trinket slots from one group", () => {
    const pool = [
      item(1, INV.finger, 40, 60),
      item(2, INV.finger, 40, 50),
      item(3, INV.finger, 40, 40),
      item(4, INV.trinket, 40, 60),
      item(5, INV.trinket, 40, 50),
    ];
    const equipped = computeEquippedAtLevel(pool, 60);
    expect(equipped[SLOT.finger1]).toBe(1);
    expect(equipped[SLOT.finger2]).toBe(2);
    expect(equipped[SLOT.trinket1]).toBe(4);
    expect(equipped[SLOT.trinket2]).toBe(5);
  });

  it("treats robes as chest items", () => {
    expect(computeEquippedAtLevel([item(1, INV.robe, 10, 20)], 20)[SLOT.chest]).toBe(1);
  });

  it("leaves the off hand empty when the best weapon is a two-hander", () => {
    const pool = [item(1, INV.twoHand, 40, 70), item(2, INV.shield, 30, 60)];
    const equipped = computeEquippedAtLevel(pool, 60);
    expect(equipped[SLOT.mainHand]).toBe(1);
    expect(equipped[SLOT.offHand]).toBeUndefined();
  });

  it("pairs a one-hander with the best off-hand-capable item", () => {
    const pool = [
      item(1, INV.oneHand, 40, 70),
      item(2, INV.shield, 40, 65),
      item(3, INV.twoHand, 30, 80),
    ];
    const equipped = computeEquippedAtLevel(pool, 60);
    expect(equipped[SLOT.mainHand]).toBe(1);
    expect(equipped[SLOT.offHand]).toBe(2);
  });

  it("does not put a main-hand-only weapon in the off hand", () => {
    const pool = [item(1, INV.oneHand, 40, 70), item(2, INV.mainHand, 40, 65)];
    const equipped = computeEquippedAtLevel(pool, 60);
    expect(equipped[SLOT.mainHand]).toBe(1);
    expect(equipped[SLOT.offHand]).toBeUndefined();
  });

  it("skips items that go in no equipment slot", () => {
    expect(computeEquippedAtLevel([item(1, INV.bag, 1, 1)], 60)).toEqual({});
  });

  it("does not mutate the pool it was given", () => {
    const pool = [item(1, INV.head, 10, 20), item(2, INV.head, 40, 50)];
    const snapshot = pool.map((p) => p.item_id);
    computeEquippedAtLevel(pool, 60);
    expect(pool.map((p) => p.item_id)).toEqual(snapshot);
  });
});

describe("upgradeLevels", () => {
  it("returns the distinct levels where the pool delivers something new", () => {
    const pool = [
      item(1, INV.head, 20, 30),
      item(2, INV.chest, 20, 30),
      item(3, INV.neck, 45, 60),
      item(4, INV.head, 90, 100), // above the cap
    ];
    expect(upgradeLevels(pool, 60)).toEqual([20, 45]);
  });

  it("clamps level-0 items to level 1 and drops unequippable ones", () => {
    expect(upgradeLevels([item(1, INV.head, 0, 5), item(2, INV.bag, 0, 5)], 60)).toEqual([1]);
  });
});

describe("averageEquippedItemLevel", () => {
  const levels: Record<number, number> = { 1: 60, 2: 80, 3: 100 };
  const levelOf = (id: number) => levels[id] ?? null;

  it("averages the slots with a known item level", () => {
    expect(averageEquippedItemLevel([[SLOT.head, 1], [SLOT.chest, 2]], levelOf)).toBe(70);
  });

  it("excludes cosmetic slots", () => {
    expect(
      averageEquippedItemLevel(
        [
          [SLOT.head, 1],
          [SLOT.shirt, 3],
          [SLOT.tabard, 3],
        ],
        levelOf,
      ),
    ).toBe(60);
  });

  it("returns null when nothing has a known item level", () => {
    expect(averageEquippedItemLevel([[SLOT.head, 99]], levelOf)).toBeNull();
    expect(averageEquippedItemLevel([], levelOf)).toBeNull();
  });

  it("reads derived sets and stages the same way", () => {
    expect(derivedAverageItemLevel({ [SLOT.head]: 1, [SLOT.chest]: 3 }, levelOf)).toBe(80);
    expect(
      stageAverageItemLevel(
        { name: "Naxx", slots: { "0": { item_id: 1 }, "4": { item_id: 3 } } },
        levelOf,
      ),
    ).toBe(80);
  });
});

describe("parseProgressionPayload", () => {
  it("parses a well-formed document", () => {
    const parsed = parseProgressionPayload({
      version: 1,
      pool: [{ item_id: 5, enchant_id: 9, note: "BoE" }],
      stages: [{ name: "Fresh 60", slots: { "0": { item_id: 5 } } }],
    });
    expect(parsed.pool).toEqual([{ item_id: 5, enchant_id: 9, note: "BoE" }]);
    expect(parsed.stages).toHaveLength(1);
    expect(parsed.version).toBe(PROGRESSION_PAYLOAD_VERSION);
  });

  it("accepts a JSON string", () => {
    const parsed = parseProgressionPayload('{"version":1,"pool":[{"item_id":7}],"stages":[]}');
    expect(parsed.pool).toEqual([{ item_id: 7 }]);
  });

  it("degrades malformed input to an empty document", () => {
    for (const raw of ["not json", null, 42, { pool: "nope" }]) {
      const parsed = parseProgressionPayload(raw);
      expect(parsed.pool).toEqual([]);
      expect(parsed.stages).toEqual([]);
    }
  });

  it("drops invalid and duplicate pool entries", () => {
    const parsed = parseProgressionPayload({
      version: 1,
      pool: [
        { item_id: 5 },
        { item_id: 5, note: "dupe" },
        { item_id: 0 },
        { item_id: -3 },
        "nope",
        { enchant_id: 4 },
      ],
      stages: [],
    });
    expect(parsed.pool).toEqual([{ item_id: 5 }]);
  });

  it("caps the pool", () => {
    const pool = Array.from({ length: MAX_POOL_ITEMS + 10 }, (_, i) => ({ item_id: i + 1 }));
    expect(parseProgressionPayload({ version: 1, pool, stages: [] }).pool).toHaveLength(
      MAX_POOL_ITEMS,
    );
  });
});

describe("pool operations", () => {
  const base: ProgressionPayload = { version: 1, pool: [{ item_id: 1 }], stages: [] };

  it("adds, rejects duplicates, and never mutates", () => {
    const next = addPoolItem(base, 2);
    expect(next.pool.map((p) => p.item_id)).toEqual([1, 2]);
    expect(base.pool).toHaveLength(1);
    expect(addPoolItem(next, 2)).toBe(next);
    expect(addPoolItem(next, 0)).toBe(next);
  });

  it("removes by item ID and is a no-op for unknown items", () => {
    expect(removePoolItem(base, 1).pool).toEqual([]);
    expect(removePoolItem(base, 99)).toBe(base);
  });

  it("sets and clears notes and enchants", () => {
    const noted = setPoolItemNote(base, 1, "world drop");
    expect(noted.pool[0].note).toBe("world drop");
    expect(setPoolItemNote(noted, 1, "").pool[0].note).toBeUndefined();

    const enchanted = setPoolItemEnchant(base, 1, 33);
    expect(enchanted.pool[0].enchant_id).toBe(33);
    expect(setPoolItemEnchant(enchanted, 1, undefined).pool[0].enchant_id).toBeUndefined();
  });
});

describe("stage operations", () => {
  it("adds and renames stages while keeping the pool", () => {
    const withPool: ProgressionPayload = { version: 1, pool: [{ item_id: 1 }], stages: [] };
    const added = addProgressionStage(withPool, "Fresh 60");
    expect(added.stages.map((s) => s.name)).toEqual(["Fresh 60"]);
    expect(added.pool).toEqual(withPool.pool);

    const renamed = renameProgressionStage(added, 0, "Pre-Raid");
    expect(renamed.stages[0].name).toBe("Pre-Raid");
    expect(renamed.pool).toEqual(withPool.pool);
  });

  it("sets and clears a stage's assumed level, keeping the pool", () => {
    const base: ProgressionPayload = {
      version: 1,
      pool: [{ item_id: 1 }],
      stages: [{ name: "Fresh 60", slots: {} }],
    };
    const pinned = setProgressionStageLevel(base, 0, 40);
    expect(pinned.stages[0].level).toBe(40);
    expect(pinned.pool).toEqual(base.pool);

    const cleared = setProgressionStageLevel(pinned, 0, undefined);
    expect(cleared.stages[0].level).toBeUndefined();
  });

  it("stage level survives a parse round-trip", () => {
    const doc = parseProgressionPayload({
      version: 1,
      pool: [],
      stages: [{ name: "Twink 39", slots: {}, level: 39 }],
    });
    expect(doc.stages[0].level).toBe(39);
  });
});

describe("snapshotStageFromDerived", () => {
  const payload: ProgressionPayload = {
    version: 1,
    pool: [{ item_id: 1, enchant_id: 42 }, { item_id: 2 }],
    stages: [{ name: "Fresh 60", slots: { "0": { item_id: 99, note: "old" } } }],
  };

  it("replaces the stage's picks with the derived set, carrying enchants", () => {
    const next = snapshotStageFromDerived(payload, 0, {
      [SLOT.head]: 1,
      [SLOT.chest]: 2,
    });
    expect(next.stages[0].slots["0"]).toEqual({ item_id: 1, enchant_id: 42, note: "old" });
    expect(next.stages[0].slots["4"]).toEqual({ item_id: 2 });
  });

  it("is a no-op for a stage index that does not exist", () => {
    expect(snapshotStageFromDerived(payload, 3, { [SLOT.head]: 1 })).toBe(payload);
  });
});

describe("slot membership", () => {
  it("maps inventory types onto the outfit slots they can fill", () => {
    expect(slotsForInventoryType(INV.head)).toEqual([SLOT.head]);
    expect(slotsForInventoryType(INV.finger)).toEqual([SLOT.finger1, SLOT.finger2]);
    expect(slotsForInventoryType(INV.robe)).toEqual([SLOT.chest]);
    expect(slotsForInventoryType(INV.bag)).toEqual([]);
  });

  it("answers whether a pool item is a candidate for a slot", () => {
    expect(itemFitsSlot(INV.trinket, SLOT.trinket2)).toBe(true);
    expect(itemFitsSlot(INV.trinket, SLOT.neck)).toBe(false);
    // Weapons share one group, so a shield is a candidate for either hand;
    // assignWeapons is what actually keeps it out of the main hand.
    expect(itemFitsSlot(INV.shield, SLOT.offHand)).toBe(true);
    expect(itemFitsSlot(INV.bag, SLOT.head)).toBe(false);
  });
});

describe("nextUpgradesAfter", () => {
  const pool = [
    item(1, INV.head, 10, 20),
    item(2, INV.head, 30, 40),
    item(3, INV.chest, 45, 55),
  ];

  it("reports the next level each slot changes at, and to what", () => {
    const next = nextUpgradesAfter(pool, 15, 60);
    expect(next.get(SLOT.head)).toEqual({ level: 30, itemId: 2 });
    expect(next.get(SLOT.chest)).toEqual({ level: 45, itemId: 3 });
  });

  it("reports the first arrival for a slot that is still empty", () => {
    expect(nextUpgradesAfter(pool, 1, 60).get(SLOT.head)).toEqual({ level: 10, itemId: 1 });
  });

  it("omits slots that never change again", () => {
    const next = nextUpgradesAfter(pool, 50, 60);
    expect(next.has(SLOT.head)).toBe(false);
    expect(next.has(SLOT.chest)).toBe(false);
  });

  it("ignores upgrades beyond the cap", () => {
    expect(nextUpgradesAfter([item(1, INV.head, 70, 90)], 10, 60).size).toBe(0);
  });
});

describe("progressionColumns", () => {
  it("emits a column per level where the derived set changes", () => {
    const pool = [item(1, INV.head, 10, 20), item(2, INV.chest, 30, 40)];
    expect(progressionColumns(pool, 60).map((c) => c.level)).toEqual([1, 10, 30]);
  });

  it("collapses levels that would repeat the previous column", () => {
    // Both unlock at 10, so 10 is a single column; nothing changes after.
    const pool = [item(1, INV.head, 10, 20), item(2, INV.chest, 10, 40)];
    expect(progressionColumns(pool, 60).map((c) => c.level)).toEqual([1, 10]);
  });

  it("always starts at level 1 and carries the equipped set", () => {
    const columns = progressionColumns([item(1, INV.head, 10, 20)], 60);
    expect(columns[0]).toEqual({ level: 1, equipped: {} });
    expect(columns[1].equipped[SLOT.head]).toBe(1);
  });

  it("returns a single column for an empty pool", () => {
    expect(progressionColumns([], 60).map((c) => c.level)).toEqual([1]);
  });
});

describe("derivedStage", () => {
  it("renders the derived set as a stage, carrying pool enchants", () => {
    const stage = derivedStage("Level 60", { [SLOT.head]: 1, [SLOT.chest]: 2 }, [
      { item_id: 1, enchant_id: 42 },
      { item_id: 2 },
    ]);
    expect(stage.name).toBe("Level 60");
    expect(stage.slots["0"]).toEqual({ item_id: 1, enchant_id: 42 });
    expect(stage.slots["4"]).toEqual({ item_id: 2 });
  });

  it("omits empty slots", () => {
    expect(Object.keys(derivedStage("x", {}, []).slots)).toEqual([]);
  });
});
