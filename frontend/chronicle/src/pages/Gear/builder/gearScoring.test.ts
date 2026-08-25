import { describe, expect, it } from "vitest";
import type { SimItem } from "@/api/typesGenerated";
import {
  aggregateItemStats,
  evaluateItemSwapTargets,
  evaluateTargets,
  formatScore,
  itemStatValues,
  parseTargets,
  parseWeights,
  scoreItem,
  scoreItems,
  STAT_KEYS,
  unknownWeightKeys,
  weaponDps,
} from "./gearScoring";

function simItem(partial: Partial<SimItem>): SimItem {
  return {
    entry: 1,
    name: "Test Item",
    class: 4,
    subclass: 1,
    item_level: 60,
    inventory_type: 1,
    delay: 0,
    armor: 0,
    block: 0,
    resistances: [0, 0, 0, 0, 0, 0],
    ...partial,
  } as SimItem;
}

describe("STAT_KEYS", () => {
  it("has unique keys and assigns each itemMod once", () => {
    const keys = STAT_KEYS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const mods = STAT_KEYS.flatMap((s) => s.itemMods ?? []);
    expect(new Set(mods).size).toBe(mods.length);
  });
});

describe("weaponDps", () => {
  it("computes average dps across damage ranges", () => {
    const item = simItem({
      delay: 2000,
      damage: [{ min: 80, max: 120, damage_type: 0 }],
    });
    expect(weaponDps(item)).toBe(50); // avg 100 / 2.0s
  });

  it("is zero without damage or delay", () => {
    expect(weaponDps(simItem({}))).toBe(0);
    expect(
      weaponDps(
        simItem({ damage: [{ min: 10, max: 20, damage_type: 0 }], delay: 0 }),
      ),
    ).toBe(0);
  });
});

describe("itemStatValues", () => {
  it("maps stat types, armor, resistances, and dps", () => {
    const item = simItem({
      stats: [
        { type: 4, value: 18 }, // strength
        { type: 3, value: 9 }, // agility
        { type: 99, value: 5 }, // unknown, ignored
      ],
      armor: 150,
      resistances: [0, 10, 0, 0, 0, 0],
      delay: 2500,
      damage: [{ min: 50, max: 100, damage_type: 0 }],
    });
    expect(itemStatValues(item)).toEqual({
      strength: 18,
      agility: 9,
      armor: 150,
      resist_fire: 10,
      weapon_dps: 30,
    });
  });

  it("sums duplicate stat types", () => {
    const item = simItem({
      stats: [
        { type: 7, value: 5 },
        { type: 7, value: 7 },
      ],
    });
    expect(itemStatValues(item)).toEqual({ stamina: 12 });
  });

  it("normalizes split combat ratings and pre-Wrath spell damage", () => {
    const item = simItem({
      stats: [
        { type: 18, value: 12 }, // spell hit rating
        { type: 19, value: 9 }, // melee crit rating
        { type: 30, value: 7 }, // spell haste rating
        { type: 42, value: 44 }, // pre-Wrath spell damage
      ],
    });
    expect(itemStatValues(item)).toEqual({
      hit: 12,
      crit: 9,
      haste: 7,
      spell_power: 44,
    });
  });

  it("counts a shield's base block as block value", () => {
    expect(itemStatValues(simItem({ block: 55 }))).toEqual({ block_value: 55 });
  });
});

describe("scoring", () => {
  const weights = { strength: 2, agility: 1.5, weapon_dps: 6 };
  const chest = simItem({
    stats: [
      { type: 4, value: 10 },
      { type: 3, value: 10 },
    ],
  });
  const sword = simItem({
    delay: 2000,
    damage: [{ min: 90, max: 110, damage_type: 0 }],
  });

  it("scores single items with unknown keys ignored", () => {
    expect(scoreItem(chest, weights)).toBe(35); // 10*2 + 10*1.5
    expect(scoreItem(sword, weights)).toBe(300); // 50 dps * 6
    expect(scoreItem(chest, { made_up: 100 })).toBe(0);
  });

  it("sums across items", () => {
    expect(scoreItems([chest, sword], weights)).toBe(335);
  });
});

describe("stage analysis", () => {
  it("aggregates item stats and evaluates minimum and maximum targets", () => {
    const totals = aggregateItemStats([
      simItem({
        stats: [
          { type: 31, value: 5 },
          { type: 7, value: 10 },
        ],
      }),
      simItem({
        stats: [
          { type: 31, value: 4 },
          { type: 7, value: 8 },
        ],
      }),
    ]);
    expect(totals).toMatchObject({ hit: 9, stamina: 18 });
    expect(
      evaluateTargets(totals, [
        { stat: "hit", type: "minimum", value: 9 },
        { stat: "stamina", type: "maximum", value: 15 },
      ]),
    ).toEqual([
      {
        stat: "hit",
        type: "minimum",
        value: 9,
        actual: 9,
        difference: 0,
        met: true,
      },
      {
        stat: "stamina",
        type: "maximum",
        value: 15,
        actual: 18,
        difference: 3,
        met: false,
      },
    ]);
  });

  it("evaluates a candidate by replacing the current item's stats", () => {
    const current = simItem({ stats: [{ type: 31, value: 2 }] });
    const candidate = simItem({ stats: [{ type: 31, value: 1 }] });
    expect(
      evaluateItemSwapTargets({ hit: 9 }, current, candidate, [
        { stat: "hit", type: "minimum", value: 9 },
      ]),
    ).toEqual([
      {
        stat: "hit",
        type: "minimum",
        value: 9,
        actual: 8,
        difference: -1,
        met: false,
      },
    ]);
  });

  it("parses only known, finite targets", () => {
    expect(
      parseTargets([
        { stat: "hit", type: "minimum", value: 9 },
        { stat: "made_up", type: "minimum", value: 2 },
        { stat: "crit", type: "between", value: 4 },
        { stat: "stamina", type: "maximum", value: "20" },
      ]),
    ).toEqual([{ stat: "hit", type: "minimum", value: 9 }]);
    expect(parseTargets("not json")).toEqual([]);
  });
});

describe("parseWeights", () => {
  it("parses strings and objects, dropping junk", () => {
    expect(parseWeights('{"strength":2,"agility":1.5}')).toEqual({
      strength: 2,
      agility: 1.5,
    });
    expect(parseWeights({ strength: 2, zero: 0, bad: "x", nan: NaN })).toEqual({
      strength: 2,
    });
    expect(parseWeights({ spell_damage: 1.5 })).toEqual({ spell_power: 1.5 });
    expect(parseWeights({ spell_damage: 1, spell_power: 2 })).toEqual({
      spell_power: 3,
    });
    expect(parseWeights("{nope")).toEqual({});
    expect(parseWeights(null)).toEqual({});
  });
});

describe("unknownWeightKeys", () => {
  it("flags keys outside the registry", () => {
    expect(unknownWeightKeys({ strength: 1, sneakiness: 3 })).toEqual([
      "sneakiness",
    ]);
  });
});

describe("formatScore", () => {
  it("shows decimals only for small scores", () => {
    expect(formatScore(1234.4)).toBe("1234");
    expect(formatScore(42.25)).toBe("42.3");
  });
});
