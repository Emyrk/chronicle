import { describe, expect, it } from "vitest";
import type { ProcessorContext, UnitPositionProcessorEvent } from "../processorTypes";
import { mapProcessor } from "./map.processor";

const context: ProcessorContext = {
  players: {},
  units: {},
  selectedEncounterIds: new Set(["encounter"]),
  entitySelection: { enemyIds: new Set(), playerIds: new Set() },
};

function position(unit: string, offsetMilli: number, x: number, y: number): UnitPositionProcessorEvent {
  return {
    type: "unit_position",
    index: offsetMilli,
    offsetMilli,
    unit,
    x,
    y,
    mapId: 533,
    facing: 1.5,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
}

describe("mapProcessor", () => {
  it("retains an ordered position timeline for every unit", () => {
    const state = mapProcessor.createState();
    const start = new Date("2026-10-07T20:00:00Z");

    mapProcessor.processEvent(state, position("player", 100, 10, 20), "encounter", start, "unit_position", context);
    mapProcessor.processEvent(state, position("enemy", 150, 30, 40), "encounter", start, "unit_position", context);
    mapProcessor.processEvent(state, position("player", 200, 11, 22), "encounter", start, "unit_position", context);

    const encounter = state.encounters.get("encounter");
    expect(encounter?.startMs).toBe(start.getTime());
    expect(encounter?.endMs).toBe(start.getTime() + 200);
    expect(encounter?.positionsByUnit.get("player")).toEqual([
      { timestampMs: start.getTime() + 100, x: 10, y: 20, mapId: 533, facing: 1.5 },
      { timestampMs: start.getTime() + 200, x: 11, y: 22, mapId: 533, facing: 1.5 },
    ]);
    expect(encounter?.positionsByUnit.get("enemy")).toHaveLength(1);
  });

  it("ignores encounters outside the current selection", () => {
    const state = mapProcessor.createState();
    mapProcessor.processEvent(
      state,
      position("player", 100, 10, 20),
      "other",
      new Date("2026-10-07T20:00:00Z"),
      "unit_position",
      context,
    );
    expect(state.encounters.size).toBe(0);
  });
});
