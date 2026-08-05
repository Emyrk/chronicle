import { describe, expect, it } from "vitest";
import type { SimItem } from "@/api/typesGenerated";
import {
  formatScore,
  itemStatValues,
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
  it("has unique keys and unique itemMods", () => {
    const keys = STAT_KEYS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    const mods = STAT_KEYS.filter((s) => s.itemMod !== undefined).map((s) => s.itemMod);
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
    expect(weaponDps(simItem({ damage: [{ min: 10, max: 20, damage_type: 0 }], delay: 0 }))).toBe(0);
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
    const item = simItem({ stats: [{ type: 7, value: 5 }, { type: 7, value: 7 }] });
    expect(itemStatValues(item)).toEqual({ stamina: 12 });
  });
});

describe("scoring", () => {
  const weights = { strength: 2, agility: 1.5, weapon_dps: 6 };
  const chest = simItem({ stats: [{ type: 4, value: 10 }, { type: 3, value: 10 }] });
  const sword = simItem({ delay: 2000, damage: [{ min: 90, max: 110, damage_type: 0 }] });

  it("scores single items with unknown keys ignored", () => {
    expect(scoreItem(chest, weights)).toBe(35); // 10*2 + 10*1.5
    expect(scoreItem(sword, weights)).toBe(300); // 50 dps * 6
    expect(scoreItem(chest, { made_up: 100 })).toBe(0);
  });

  it("sums across items", () => {
    expect(scoreItems([chest, sword], weights)).toBe(335);
  });
});

describe("parseWeights", () => {
  it("parses strings and objects, dropping junk", () => {
    expect(parseWeights('{"strength":2,"agility":1.5}')).toEqual({ strength: 2, agility: 1.5 });
    expect(parseWeights({ strength: 2, zero: 0, bad: "x", nan: NaN })).toEqual({ strength: 2 });
    expect(parseWeights("{nope")).toEqual({});
    expect(parseWeights(null)).toEqual({});
  });
});

describe("unknownWeightKeys", () => {
  it("flags keys outside the registry", () => {
    expect(unknownWeightKeys({ strength: 1, sneakiness: 3 })).toEqual(["sneakiness"]);
  });
});

describe("formatScore", () => {
  it("shows decimals only for small scores", () => {
    expect(formatScore(1234.4)).toBe("1234");
    expect(formatScore(42.25)).toBe("42.3");
  });
});
