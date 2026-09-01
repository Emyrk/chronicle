import { describe, expect, it } from "vitest";
import type { ProcessorContext, RaidGroupProcessorEvent } from "../processorTypes";
import { raidCompositionProcessor } from "./raidComposition.processor";

function context(selectedEncounterIds: string[]): ProcessorContext {
  return {
    players: {},
    selectedEncounterIds: new Set(selectedEncounterIds),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
  };
}

function raidGroupEvent(members: string[], offsetMilli = 0): RaidGroupProcessorEvent {
  return {
    type: "raid_group",
    index: 0,
    offsetMilli,
    groupMemberGuids: [...members, ...Array<string>(40 - members.length).fill("")],
    activity: [],
    activityCount: 0,
    isSynthetic: true,
  };
}

describe("raidCompositionProcessor", () => {
  it("preserves fixed subgroup slots and gaps", () => {
    const state = raidCompositionProcessor.createState();

    raidCompositionProcessor.processEvent(
      state,
      raidGroupEvent(["tank", "", "healer", "dps", ""]),
      "selected",
      new Date("2026-09-01T20:00:00Z"),
      "raid_group",
      context(["selected"]),
    );

    expect(state.groups).toHaveLength(8);
    expect(state.groups[0]).toEqual(["tank", "", "healer", "dps", ""]);
    expect(state.groups[1]).toEqual(["", "", "", "", ""]);
  });

  it("keeps the latest composition from selected encounters", () => {
    const state = raidCompositionProcessor.createState();
    const processorContext = context(["selected"]);

    raidCompositionProcessor.processEvent(
      state,
      raidGroupEvent(["ignored"]),
      "other",
      new Date("2026-09-01T19:00:00Z"),
      "raid_group",
      processorContext,
    );
    raidCompositionProcessor.processEvent(
      state,
      raidGroupEvent(["first"]),
      "selected",
      new Date("2026-09-01T20:00:00Z"),
      "raid_group",
      processorContext,
    );
    raidCompositionProcessor.processEvent(
      state,
      raidGroupEvent(["latest"], 2500),
      "selected",
      new Date("2026-09-01T21:00:00Z"),
      "raid_group",
      processorContext,
    );

    expect(state.groups[0][0]).toBe("latest");
    expect(state.encounterID).toBe("selected");
    expect(state.observedAt).toBe(new Date("2026-09-01T21:00:02.500Z").getTime());
  });
});
