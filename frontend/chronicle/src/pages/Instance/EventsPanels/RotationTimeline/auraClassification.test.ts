import { describe, expect, it } from "vitest";
import { classifyAura, combinePlacements } from "./auraClassification";

describe("classifyAura", () => {
  it("shows the player's own class spells", () => {
    expect(classifyAura("Rogue", "Rogue", false)).toBe("key");
    expect(classifyAura("Death Knight", "DeathKnight", false)).toBe("key");
  });

  it("hides other classes' buffs", () => {
    expect(classifyAura("Druid", "Rogue", false)).toBe("hidden"); // Mark of the Wild
    expect(classifyAura("Priest", "Rogue", false)).toBe("hidden"); // Power Word: Fortitude
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
  it("hides a row only when every player hides it", () => {
    expect(combinePlacements(["hidden", "hidden"])).toBe("hidden");
    expect(combinePlacements(["hidden", "other"])).toBe("other");
    expect(combinePlacements(["other", "key"])).toBe("key");
  });
});
