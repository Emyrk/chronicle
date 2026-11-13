import { describe, expect, it } from "vitest";
import type { ResolvedInstanceUnit } from "../../instanceUnits";
import { createEncounterEffects } from "./replayEffects";
import type { MapEncounterPositions, MapPositionSample } from "./map.processor";
import { totemLifetimes } from "./totemLifetime";

const position = (timestampMs: number, synthetic = false): MapPositionSample => ({
  timestampMs, x: 0, y: 0, mapId: 1, synthetic,
});

function encounter(positions: Record<string, MapPositionSample[]>): MapEncounterPositions {
  return {
    encounterId: "fight", startMs: 0, endMs: 300_000,
    positionsByUnit: new Map(Object.entries(positions)),
    healthByUnit: new Map(), effects: createEncounterEffects(),
    debuffsByUnit: new Map(), activePlayerGuids: [],
  };
}

const units: Record<string, ResolvedInstanceUnit> = {
  air1: { name: "Windfury Totem", entry: 52144, owner: "shaman1" },
  air2: { name: "Grounding Totem", entry: 5925, owner: "shaman1" },
  water: { name: "Mana Spring Totem IV", entry: 7416, owner: "shaman1" },
  otherAir: { name: "Windfury Totem", entry: 52144, owner: "shaman2" },
  unknown: { name: "Custom Water Totem V", entry: 999999, owner: "shaman1" },
  enemy: { name: "Corrupted Windfury Totem", entry: 14666 },
};

describe("totemLifetimes", () => {
  it("replaces only the same owner's element and respects different durations", () => {
    const lives = totemLifetimes(encounter({
      air1: [position(1_000)], water: [position(2_000)],
      otherAir: [position(3_000)], air2: [position(4_000)],
    }), units);
    expect(lives.get("air1")).toEqual({ startMs: 1_000, endMs: 4_000 });
    expect(lives.get("water")).toEqual({ startMs: 2_000, endMs: 74_000 });
    expect(lives.get("otherAir")).toEqual({ startMs: 3_000, endMs: 147_000 });
    expect(lives.get("air2")).toEqual({ startMs: 4_000, endMs: 49_000 });
  });

  it("starts at the first real sample and ends on recall or death", () => {
    const fight = encounter({
      air1: [position(0, true), position(10_000)],
      water: [position(20_000)],
      otherAir: [position(21_000)],
    });
    fight.effects.events.push(
      { kind: "cast_go", source: "shaman1", target: "shaman1", spellId: 45513, timestampMs: 15_000 } as never,
      { kind: "cast_go", source: "shaman1", target: "shaman1", spellId: 45513, timestampMs: 30_000 } as never,
      { kind: "cast_go", source: "shaman2", target: "other", spellId: 45513, timestampMs: 22_000 } as never,
    );
    fight.effects.deathsByUnit.set("otherAir", [25_000]);
    const lives = totemLifetimes(fight, units);
    expect(lives.get("air1")).toEqual({ startMs: 10_000, endMs: 15_000 });
    expect(lives.get("water")).toEqual({ startMs: 20_000, endMs: 30_000 });
    expect(lives.get("otherAir")).toEqual({ startMs: 21_000, endMs: 25_000 });
  });

  it("expires unknown named totems, and does not mistake hostile totems for summons", () => {
    const lives = totemLifetimes(encounter({ unknown: [position(0)], enemy: [position(1_000)] }), units);
    expect(lives.get("unknown")).toEqual({ startMs: 0, endMs: 144_000 });
    expect(lives.has("enemy")).toBe(false);
  });
});
