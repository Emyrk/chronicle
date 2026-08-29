import { describe, expect, it } from "vitest";
import type { ProcessorContext, SlainProcessorEvent } from "../processorTypes";
import { timelineProcessor } from "./timeline.processor";

describe("timeline processor annotations", () => {
  it("collects selected-encounter player deaths with global offsets", () => {
    const state = timelineProcessor.createState();
    const context: ProcessorContext = {
      players: {
        player: { name: "Alice", class: "MAGE" },
      },
      selectedEncounterIds: new Set(["selected"]),
      entitySelection: { playerIds: new Set(), enemyIds: new Set() },
      panelContext: {
        timelineSeries: [{
          id: "damage",
          name: "Damage",
          stream: "damage",
          aggregation: "sum",
          color: "#fff",
          filters: [],
        }],
      },
    };
    const event: SlainProcessorEvent = {
      type: "slain",
      target: "player",
      caster: "enemy",
      attribution: null,
      index: 1,
      offsetMilli: 2_000,
      globalOffsetMilli: 12_000,
      activity: [],
      activityCount: 0,
      isSynthetic: false,
    };

    timelineProcessor.processEvent(
      state,
      event,
      "selected",
      new Date("2026-08-29T12:00:00Z"),
      "slain",
      context,
    );
    timelineProcessor.processEvent(
      state,
      { ...event, target: "enemy" },
      "selected",
      new Date("2026-08-29T12:00:00Z"),
      "slain",
      context,
    );
    timelineProcessor.processEvent(
      state,
      event,
      "unselected",
      new Date("2026-08-29T12:00:00Z"),
      "slain",
      context,
    );

    expect(state.playerDeaths).toEqual([{
      offsetMs: 12_000,
      playerId: "player",
      playerName: "Alice",
      className: "MAGE",
    }]);
  });
});
