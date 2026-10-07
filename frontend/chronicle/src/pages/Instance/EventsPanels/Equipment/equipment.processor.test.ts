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
      gemEnchantIds: [0, 0, 3637, 0],
      itemLevel: 120,
      bonusIds: [6652, 10356],
      gems: [{ itemId: 25897, itemLevel: 70 }],
    }],
    gearCount: 1,
    v22: null,
    talents: null,
  };
}

describe("equipmentProcessor", () => {
  it("preserves gem positions outside the reusable decoder event", () => {
    const state = equipmentProcessor.createState();
    const event = combatantInfo();

    equipmentProcessor.processEvent(state, event, "encounter", new Date(0), "combatant_info", context());
    event.gear[0].gemEnchantIds[2] = 0;
    event.gear[0].bonusIds[0] = 0;
    event.gear[0].gems[0].itemId = 0;

    const gear = state.players.get("player")?.gear[0];
    expect(gear?.gemEnchantIds).toEqual([0, 0, 3637, 0]);
    expect(gear?.bonusIds).toEqual([6652, 10356]);
    expect(gear?.gems).toEqual([{ itemId: 25897, itemLevel: 70 }]);
  });
});
