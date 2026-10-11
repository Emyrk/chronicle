import { describe, expect, it } from "vitest";
import { classifyAura, combinePlacements } from "./auraClassification";

describe("classifyAura", () => {
  it("shows the player's own class spells", () => {
    expect(classifyAura("Rogue", "Rogue", false)).toBe("key");
    expect(classifyAura("Death Knight", "DeathKnight", false)).toBe("key");
  });

  it("moves other classes' buffs to Other", () => {
    expect(classifyAura("Druid", "Rogue", false)).toBe("other"); // Mark of the Wild
    expect(classifyAura("Priest", "Rogue", false)).toBe("other"); // Power Word: Fortitude
  });

  it("shows generic spells such as consumables and enchant procs", () => {
    expect(classifyAura("Generic", "Rogue", false)).toBe("key");
  });

  it("moves admin-ignored and unknown spells to Other", () => {
    expect(classifyAura("Rogue", "Rogue", true)).toBe("other");
    expect(classifyAura(undefined, "Rogue", false)).toBe("other");
  });
});

describe("combinePlacements", () => {
  it("is key when key for any player", () => {
    expect(combinePlacements(["other", "other"])).toBe("other");
    expect(combinePlacements(["other", "key"])).toBe("key");
  });
});
