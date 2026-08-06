import { describe, expect, it } from "vitest";
import { equipmentProcessor, type PlayerSnapshot } from "../equipment.processor";
import { deriveCapabilities } from "./capabilities";

function player(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    guid: "player",
    name: "Player",
    heroClass: "Mage",
    race: "Human",
    gender: 0,
    guildName: null,
    gear: [],
    gearCount: 0,
    talents: null,
    ...overrides,
  };
}

describe("Equipment deriveCapabilities", () => {
  it("returns false capabilities without a result", () => {
    expect(deriveCapabilities(null)).toEqual({ hasPlayers: false, hasMultiplePlayers: false, hasGear: false, hasEnchants: false, hasTalents: false });
  });

  it("detects gear, enchants, talents, and multiple players", () => {
    const result = equipmentProcessor.createState();
    result.players.set("a", player({ guid: "a", gear: [{ itemId: 1, enchantId: 2, temporaryEnchantId: null }], gearCount: 1, talents: { summary: [31, 0, 20], trees: ["1", "", "1"] } }));
    result.players.set("b", player({ guid: "b" }));
    expect(deriveCapabilities(result)).toEqual({ hasPlayers: true, hasMultiplePlayers: true, hasGear: true, hasEnchants: true, hasTalents: true });
  });
});
