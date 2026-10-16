import { describe, expect, it } from "vitest";
import type { ProcessorContext, UnitResourcesProcessorEvent } from "../processorTypes";
import { actualRaidHealthProcessor } from "./actualRaidHealth.processor";

const PLAYER = "player";
const ENEMY = "enemy";

function context(): ProcessorContext {
  return {
    players: { [PLAYER]: { name: "Tank", class: "WARRIOR" } },
    units: { [ENEMY]: { name: "Boss", owner: null, entry: 1 } },
    selectedEncounterIds: new Set(["encounter"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function resources(overrides: Partial<UnitResourcesProcessorEvent> = {}): UnitResourcesProcessorEvent {
  return {
    type: "unit_resources",
    index: 1,
    offsetMilli: 1_000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    unit: PLAYER,
    currentHealth: 4_000,
    maximumHealth: 5_000,
    absorb: 0,
    powerType: "RAGE",
    currentPower: 10,
    maximumPower: 100,
    attackPower: 500,
    spellPower: 0,
    unitLevel: 60,
    averageItemLevel: null,
    armor: 4_000,
    ...overrides,
  };
}

describe("actualRaidHealthProcessor", () => {
  it("records changed player health samples", () => {
    const state = actualRaidHealthProcessor.createState();
    const start = new Date("2026-01-01T00:00:00Z");
    const ctx = context();

    actualRaidHealthProcessor.processEvent(state, resources(), "encounter", start, "unit_resources", ctx);
    actualRaidHealthProcessor.processEvent(state, resources({ index: 2, offsetMilli: 2_000 }), "encounter", start, "unit_resources", ctx);
    actualRaidHealthProcessor.processEvent(state, resources({ index: 3, offsetMilli: 3_000, currentHealth: 2_500 }), "encounter", start, "unit_resources", ctx);
    actualRaidHealthProcessor.processEvent(state, resources({ index: 4, unit: ENEMY }), "encounter", start, "unit_resources", ctx);

    expect(state.encounters.get("encounter")?.resourcesByUnit.get(PLAYER)).toEqual([
      { timestampMilli: start.getTime() + 1_000, currentHealth: 4_000, maximumHealth: 5_000 },
      { timestampMilli: start.getTime() + 3_000, currentHealth: 2_500, maximumHealth: 5_000 },
    ]);
    expect(state.encounters.get("encounter")?.resourcesByUnit.has(ENEMY)).toBe(false);
  });
});
