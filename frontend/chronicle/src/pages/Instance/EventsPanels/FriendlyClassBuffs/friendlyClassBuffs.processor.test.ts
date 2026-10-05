import { describe, expect, it } from "vitest";
import {
  AuraApplication,
  AuraState,
  AuraTransition,
  type AuraProcessorEvent,
  type ProcessorContext,
} from "../processorTypes";
import { friendlyClassBuffsProcessor, UNKNOWN_CASTER_ID } from "./friendlyClassBuffs.processor";

const CASTER = "0x0000000000000001";
const TARGET = "0x0000000000000002";

function context(): ProcessorContext {
  return {
    players: {
      [CASTER]: { name: "Brannor", class: "Priest" },
      [TARGET]: { name: "Solnius", class: "Warrior" },
    },
    selectedEncounterIds: new Set(["enc1"]),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  };
}

function aura(overrides: Partial<AuraProcessorEvent> = {}): AuraProcessorEvent {
  return {
    type: "aura",
    index: 1,
    offsetMilli: 0,
    target: TARGET,
    caster: CASTER,
    spellName: "Power Word: Fortitude",
    spellId: 1243,
    amount: 1,
    application: AuraApplication.Gains,
    state: AuraState.Added,
    transition: AuraTransition.Applied,
    isBuff: true,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellAttackOutcome: null,
    ...overrides,
  };
}

function process(event: AuraProcessorEvent, encounterID = "enc1") {
  const state = friendlyClassBuffsProcessor.createState();
  friendlyClassBuffsProcessor.processEvent(state, event, encounterID, new Date(0), "aura", context());
  return state;
}

describe("friendlyClassBuffsProcessor", () => {
  it("aggregates an application by caster and target", () => {
    const state = process(aura());

    expect(state.byCaster.get(CASTER)?.applications).toBe(1);
    expect(state.byCaster.get(CASTER)?.bySpell.get(1243)?.otherPlayers.get(TARGET)?.applications).toBe(1);
    expect(state.byTarget.get(TARGET)?.bySpell.get(1243)?.otherPlayers.get(CASTER)?.applications).toBe(1);
  });

  it("counts refreshes but ignores removals and stack changes", () => {
    const state = friendlyClassBuffsProcessor.createState();
    const ctx = context();
    for (const event of [
      aura(),
      aura({ transition: AuraTransition.Refreshed }),
      aura({ state: AuraState.Modified, transition: AuraTransition.StackChanged, amount: 2 }),
      aura({ state: AuraState.Removed, transition: AuraTransition.Removed, amount: 0 }),
    ]) {
      friendlyClassBuffsProcessor.processEvent(state, event, "enc1", new Date(0), "aura", ctx);
    }

    expect(state.byCaster.get(CASTER)?.applications).toBe(2);
  });

  it("records unknown casters for the received perspective", () => {
    const state = process(aura({ caster: null }));

    expect(state.byCaster.size).toBe(0);
    expect(state.byTarget.get(TARGET)?.bySpell.get(1243)?.otherPlayers.get(UNKNOWN_CASTER_ID)?.applications).toBe(1);
    expect(state.unattributedApplications).toBe(1);
  });

  it("ignores self buffs, debuffs, missing spell IDs, non-players, and unselected encounters", () => {
    const events = [
      aura({ target: CASTER }),
      aura({ isBuff: false }),
      aura({ spellId: null }),
      aura({ target: "creature" }),
    ];

    for (const event of events) {
      expect(process(event).byCaster.size).toBe(0);
    }
    expect(process(aura(), "enc2").byCaster.size).toBe(0);
  });
});
