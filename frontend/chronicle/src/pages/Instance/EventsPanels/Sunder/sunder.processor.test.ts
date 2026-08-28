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

function createAuraCastEvent(
  spellId: number,
  overrides: Partial<AuraCastProcessorEvent> = {},
): AuraCastProcessorEvent {
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
    ...overrides,
  };
}

function createAuraEvent(
  spellId: number,
  overrides: Partial<AuraProcessorEvent> = {},
): AuraProcessorEvent {
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
    ...overrides,
  };
}

function createSpellGoEvent(
  spellId: number,
  overrides: Partial<SpellGoProcessorEvent> = {},
): SpellGoProcessorEvent {
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
    ...overrides,
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

  it("correlates Wrath cast successes with Sunder aura stack updates", () => {
    const state = sunderProcessor.createState();
    const context = createContext();

    for (let stack = 1; stack <= 5; stack++) {
      const offsetMilli = stack * 1000;
      sunderProcessor.processEvent(
        state,
        createSpellGoEvent(7386, { offsetMilli, numHits: 0, numMisses: 0 }),
        ENCOUNTER_ID,
        FIRST_TIMESTAMP,
        "spell_go",
        context,
      );

      if (stack === 1) {
        // Wrath emits this synthetic AuraCast without vanilla effect metadata.
        sunderProcessor.processEvent(
          state,
          createAuraCastEvent(7386, { offsetMilli, effect: 0, effectMiscValue: 0 }),
          ENCOUNTER_ID,
          FIRST_TIMESTAMP,
          "aura_cast",
          context,
        );
      }

      sunderProcessor.processEvent(
        state,
        createAuraEvent(7386, {
          offsetMilli: offsetMilli + 10,
          spellName: "Sunder Armor",
          amount: stack,
          state: stack === 1 ? AuraState.Added : AuraState.Modified,
        }),
        ENCOUNTER_ID,
        FIRST_TIMESTAMP,
        "aura",
        context,
      );
    }

    expect(state.warriors[CASTER_GUID]?.effectiveSunders).toBe(5);
    expect(state.targets[TARGET_GUID]?.totalSunders).toBe(5);
    expect(state.targets[TARGET_GUID]?.timeToFiveStacksMs).toBe(5010);
    expect(state._targetStacks[TARGET_GUID]).toBe(5);
  });

  it.each([20243, 30016, 30022, 47497, 47498])("attributes Devastate rank spell ID %i to its Sunder aura update", (spellId) => {
    const state = sunderProcessor.createState();
    const context = createContext();

    sunderProcessor.processEvent(
      state,
      createSpellGoEvent(spellId, {
        numHits: 0,
        numMisses: 0,
        spell: { id: spellId, name: "Devastate" },
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      context,
    );
    sunderProcessor.processEvent(
      state,
      createAuraEvent(47467, {
        offsetMilli: 1010,
        spellName: "Sunder Armor",
        amount: 1,
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );

    expect(state.warriors[CASTER_GUID]?.effectiveSunders).toBe(1);
    expect(state.targets[TARGET_GUID]?.totalSunders).toBe(1);
    expect(state.targets[TARGET_GUID]?.first5Contributors).toEqual([
      { guid: CASTER_GUID, name: "Tank", stackNumber: 1 },
    ]);
  });

  it("credits both stacks when glyphed Devastate takes a target from 3 to 5", () => {
    const state = sunderProcessor.createState();
    const context = createContext();
    state._targetStacks[TARGET_GUID] = 3;

    sunderProcessor.processEvent(
      state,
      createSpellGoEvent(47498, {
        numHits: 0,
        numMisses: 0,
        spell: { id: 47498, name: "Devastate" },
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      context,
    );
    sunderProcessor.processEvent(
      state,
      createAuraEvent(47467, {
        offsetMilli: 1010,
        spellName: "Sunder Armor",
        amount: 5,
        state: AuraState.Modified,
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );

    expect(state.warriors[CASTER_GUID]?.effectiveSunders).toBe(2);
    expect(state.targets[TARGET_GUID]?.totalSunders).toBe(2);
    expect(state.targets[TARGET_GUID]?.first5Contributors).toEqual([
      { guid: CASTER_GUID, name: "Tank", stackNumber: 4 },
      { guid: CASTER_GUID, name: "Tank", stackNumber: 5 },
    ]);
    expect(state.targets[TARGET_GUID]?.timeToFiveStacksMs).toBe(1010);
    expect(state._targetStacks[TARGET_GUID]).toBe(5);
  });

  it("records a Wrath Sunder refresh when the aura stack does not increase", () => {
    const state = sunderProcessor.createState();
    const context = createContext();
    state._targetStacks[TARGET_GUID] = 5;

    sunderProcessor.processEvent(
      state,
      createSpellGoEvent(47467, { numHits: 0, numMisses: 0 }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      context,
    );
    sunderProcessor.processEvent(
      state,
      createAuraEvent(47467, {
        offsetMilli: 1010,
        spellName: "Sunder Armor",
        amount: 1,
        state: AuraState.Modified,
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );

    expect(state.warriors[CASTER_GUID]?.effectiveSunders).toBe(0);
    expect(state.warriors[CASTER_GUID]?.refreshSunders).toBe(1);
    expect(state._targetStacks[TARGET_GUID]).toBe(5);
  });

  it("marks an unconfirmed Wrath cast as failed after the confirmation window", () => {
    const state = sunderProcessor.createState();
    const context = createContext();

    sunderProcessor.processEvent(
      state,
      createSpellGoEvent(47467, { numHits: 0, numMisses: 0 }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      context,
    );
    sunderProcessor.processEvent(
      state,
      createAuraEvent(11198, { offsetMilli: 1600, spellName: "Expose Armor" }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );

    expect(state.warriors[CASTER_GUID]?.failedSunders).toBe(1);
    expect(state._pendingSunders).toHaveLength(0);
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
