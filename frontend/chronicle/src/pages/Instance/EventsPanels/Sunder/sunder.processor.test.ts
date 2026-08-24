import { describe, expect, it } from "vitest";
import {
  AuraApplication,
  AuraState,
  type AuraCastProcessorEvent,
  type AuraProcessorEvent,
  type ProcessorContext,
  type SpellGoProcessorEvent,
} from "../processorTypes";
import { sunderProcessor } from "./sunder.processor";

const ENCOUNTER_ID = "enc1";
const CASTER_GUID = "player-1";
const TARGET_GUID = "target-1";
const FIRST_TIMESTAMP = new Date(0);

function createContext(): ProcessorContext {
  return {
    players: {
      [CASTER_GUID]: { name: "Tank", class: "Warrior" },
    },
    units: {
      [TARGET_GUID]: { name: "Boss", owner: null, entry: 1 },
    },
    selectedEncounterIds: new Set([ENCOUNTER_ID]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
  };
}

function createAuraCastEvent(spellId: number): AuraCastProcessorEvent {
  return {
    type: "aura_cast",
    index: 0,
    offsetMilli: 1000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: CASTER_GUID,
    target: TARGET_GUID,
    spell: { id: spellId, name: "Sunder Armor" },
    effect: 6,
    amplitude: 0,
    effectMiscValue: 1,
    durationMS: 30000,
    capStatus: 0,
    effectAuraName: 0,
  };
}

function createAuraEvent(spellId: number): AuraProcessorEvent {
  return {
    type: "aura",
    index: 0,
    offsetMilli: 500,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    target: TARGET_GUID,
    spellName: "",
    spellId,
    spellAttackOutcome: null,
    amount: 1,
    application: AuraApplication.Gains,
    state: AuraState.Added,
  };
}

function createSpellGoEvent(spellId: number): SpellGoProcessorEvent {
  return {
    type: "spell_go",
    index: 0,
    offsetMilli: 1000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: CASTER_GUID,
    target: TARGET_GUID,
    spell: { id: spellId, name: "Sunder Armor" },
    numHits: 0,
    numMisses: 1,
    itemId: null,
    corpseOwner: null,
  };
}

describe("sunderProcessor", () => {
  it.each([11597, 25225, 47467])("tracks Sunder Armor rank spell ID %i", (spellId) => {
    const state = sunderProcessor.createState();

    sunderProcessor.processEvent(
      state,
      createAuraCastEvent(spellId),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      createContext(),
    );

    expect(state.warriors[CASTER_GUID]?.effectiveSunders).toBe(1);
    expect(state.targets[TARGET_GUID]?.totalSunders).toBe(1);
  });

  it("tracks failed rank 7 Sunder Armor casts", () => {
    const state = sunderProcessor.createState();

    sunderProcessor.processEvent(
      state,
      createSpellGoEvent(47467),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      createContext(),
    );

    expect(state.warriors[CASTER_GUID]?.failedSunders).toBe(1);
  });

  it.each([11198, 26866, 48669])("detects Expose Armor rank spell ID %i", (spellId) => {
    const state = sunderProcessor.createState();
    const context = createContext();

    sunderProcessor.processEvent(
      state,
      createAuraEvent(spellId),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );
    sunderProcessor.processEvent(
      state,
      createAuraCastEvent(47467),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      context,
    );

    expect(state.warriors[CASTER_GUID]?.effectiveSunders).toBe(0);
    expect(state.warriors[CASTER_GUID]?.failedSunders).toBe(1);
    expect(state.targets[TARGET_GUID]?.debugEvents).toContainEqual({
      offsetMs: 1000,
      type: "armor_exposed",
      casterName: "Tank",
    });
  });
});
