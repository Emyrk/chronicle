import { describe, expect, it } from "vitest";
import type { CombatantInfoProcessorEvent, ProcessorContext } from "../processorTypes";
import { equipmentProcessor } from "./equipment.processor";

function context(): ProcessorContext {
  return {
    players: {},
    selectedEncounterIds: new Set(["encounter"]),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  };
}

function combatantInfo(): CombatantInfoProcessorEvent {
  return {
    type: "combatant_info",
    index: 1,
    offsetMilli: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    guid: "player",
    name: "Player",
    heroClass: "Mage",
    race: "Human",
    gender: 0,
    guildName: null,
    gear: [{
      itemId: 51396,
      enchantId: null,
      temporaryEnchantId: null,
      gemIds: [0, 0, 41398, 0],
    }],
    gearCount: 1,
    talents: null,
  };
}

describe("equipmentProcessor", () => {
  it("preserves gem positions outside the reusable decoder event", () => {
    const state = equipmentProcessor.createState();
    const event = combatantInfo();

    equipmentProcessor.processEvent(state, event, "encounter", new Date(0), "combatant_info", context());
    event.gear[0].gemIds[2] = 0;

    expect(state.players.get("player")?.gear[0].gemIds).toEqual([0, 0, 41398, 0]);
  });
});
