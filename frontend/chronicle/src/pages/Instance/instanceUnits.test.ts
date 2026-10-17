import { describe, expect, it } from "vitest";
import { resolveInstanceUnits } from "./instanceUnits";

describe("resolveInstanceUnits", () => {
  it("resolves compact names and summon owners", () => {
    const units = resolveInstanceUnits(
      {
        "totem-1": { entry: 7424 },
        "totem-2": { entry: 7424 },
        boss: { name: "Boss", entry: 123 },
      },
      { 7424: "Fire Resistance Totem" },
      { player: ["totem-1", "totem-2"] },
    );

    expect(units).toEqual({
      "totem-1": { name: "Fire Resistance Totem", entry: 7424, owner: "player" },
      "totem-2": { name: "Fire Resistance Totem", entry: 7424, owner: "player" },
      boss: { name: "Boss", entry: 123 },
    });
  });

  it("keeps inline metadata and falls back to the guid", () => {
    const units = resolveInstanceUnits(
      {
        summon: { name: "Custom Name", entry: 1, owner: "direct-owner" },
        unknown: { entry: 0 },
      },
      { 1: "Shared Name" },
      { "indexed-owner": ["summon"] },
    );

    expect(units.summon).toEqual({ name: "Custom Name", entry: 1, owner: "direct-owner" });
    expect(units.unknown.name).toBe("unknown");
  });
});
