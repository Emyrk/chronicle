import { describe, expect, it } from "vitest";
import type { ProcessorContext, SpellGoProcessorEvent } from "../../processorTypes";
import { playerActionTimelineProcessor } from "./playerActionTimeline.processor";

function context(playerIds: string[], encounterIds = ["encounter"]): ProcessorContext {
  return {
    players: {},
    selectedEncounterIds: new Set(encounterIds),
    entitySelection: {
      playerIds: new Set(playerIds),
      enemyIds: new Set(),
    },
  };
}

function spellGo(caster: string): SpellGoProcessorEvent {
  return {
    type: "spell_go",
    index: 7,
    offsetMilli: 1_250,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster,
    target: "target",
    spell: { id: 23922, name: "Shield Slam" },
    numHits: 1,
    numMisses: 0,
    itemId: null,
    corpseOwner: null,
  };
}

describe("playerActionTimelineProcessor", () => {
  it("records actions for the single selected player", () => {
    const state = playerActionTimelineProcessor.createState();

    playerActionTimelineProcessor.processEvent(
      state,
      spellGo("player"),
      "encounter",
      new Date(0),
      "spell_go",
      context(["player"]),
    );

    expect(state.playerGuid).toBe("player");
    expect(state.events).toEqual([expect.objectContaining({
      spellName: "Shield Slam",
      offsetMilli: 1_250,
      eventType: "spell_go",
    })]);
  });

  it("ignores events without exactly one selected player", () => {
    const state = playerActionTimelineProcessor.createState();

    playerActionTimelineProcessor.processEvent(
      state,
      spellGo("player"),
      "encounter",
      new Date(0),
      "spell_go",
      context([]),
    );
    playerActionTimelineProcessor.processEvent(
      state,
      spellGo("player"),
      "encounter",
      new Date(0),
      "spell_go",
      context(["player", "other"]),
    );

    expect(state.events).toEqual([]);
  });
});
