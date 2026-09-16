import { describe, expect, it } from "vitest";
import {
  AuraApplication,
  AuraState,
  AuraTransition,
  type AuraCastProcessorEvent,
  type AuraProcessorEvent,
  type ProcessorContext,
  type SpellGoProcessorEvent,
} from "../processorTypes";
import { faerieFireProcessor } from "./faerieFire.processor";

const ENCOUNTER_ID = "enc1";
const CASTER_GUID = "druid-1";
const TARGET_GUID = "target-1";
const FIRST_TIMESTAMP = new Date(0);

function createContext(): ProcessorContext {
  return {
    players: {
      [CASTER_GUID]: { name: "Leafy", class: "Druid" },
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
    spell: { id: spellId, name: "Faerie Fire" },
    effect: 6,
    amplitude: 0,
    effectMiscValue: 1,
    durationMS: 40000,
    capStatus: 0,
    effectAuraName: 0,
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
    spell: { id: spellId, name: "Faerie Fire" },
    numHits: 0,
    numMisses: 1,
    itemId: null,
    corpseOwner: null,
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
    offsetMilli: 1010,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    target: TARGET_GUID,
    caster: CASTER_GUID,
    spellName: "Faerie Fire",
    spellId,
    spellAttackOutcome: null,
    amount: 1,
    application: AuraApplication.Gains,
    state: AuraState.Added,
    transition: AuraTransition.Applied,
    isBuff: false,
    ...overrides,
  };
}

describe("faerieFireProcessor", () => {
  it.each([
    [770, "Faerie Fire"],
    [9907, "Faerie Fire"],
    [16857, "Faerie Fire (Feral)"],
    [17392, "Faerie Fire (Feral)"],
  ])("tracks spell ID %i for %s", (spellId, spellName) => {
    const state = faerieFireProcessor.createState();

    faerieFireProcessor.processEvent(
      state,
      createAuraCastEvent(spellId, { spell: { id: spellId, name: spellName } }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      createContext(),
    );

    expect(state.druids[CASTER_GUID]).toMatchObject({
      applications: 1,
      refreshes: 0,
      failures: 0,
    });
    expect(state.targets[TARGET_GUID]).toMatchObject({
      firstApplicationMs: 1000,
      firstCasterGuid: CASTER_GUID,
      firstCasterName: "Leafy",
      applications: 1,
      refreshes: 0,
    });
  });

  it("treats a cast on an active target as a refresh instead of a stack", () => {
    const state = faerieFireProcessor.createState();
    const context = createContext();

    faerieFireProcessor.processEvent(
      state,
      createAuraCastEvent(9907),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      context,
    );
    faerieFireProcessor.processEvent(
      state,
      createAuraCastEvent(9907, { offsetMilli: 5000 }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      context,
    );

    expect(state.druids[CASTER_GUID]).toMatchObject({ applications: 1, refreshes: 1 });
    expect(state.targets[TARGET_GUID]).toMatchObject({ applications: 1, refreshes: 1 });
    expect(state.targets[TARGET_GUID].debugEvents.map((event) => event.type)).toEqual([
      "applied",
      "refreshed",
    ]);
  });

  it("allows a new application after the aura is removed", () => {
    const state = faerieFireProcessor.createState();
    const context = createContext();

    faerieFireProcessor.processEvent(
      state,
      createAuraCastEvent(9907),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      context,
    );
    faerieFireProcessor.processEvent(
      state,
      createAuraEvent(9907, {
        offsetMilli: 2000,
        amount: 0,
        state: AuraState.Removed,
        application: AuraApplication.Fades,
        transition: AuraTransition.Removed,
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );
    faerieFireProcessor.processEvent(
      state,
      createAuraCastEvent(9907, { offsetMilli: 3000 }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      context,
    );

    expect(state.druids[CASTER_GUID]).toMatchObject({ applications: 2, refreshes: 0 });
    expect(state.targets[TARGET_GUID].debugEvents.map((event) => event.type)).toEqual([
      "applied",
      "removed",
      "applied",
    ]);
  });

  it("tracks explicit misses and resists as failures", () => {
    const state = faerieFireProcessor.createState();

    faerieFireProcessor.processEvent(
      state,
      createSpellGoEvent(16857, {
        spell: { id: 16857, name: "Faerie Fire (Feral)" },
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      createContext(),
    );

    expect(state.druids[CASTER_GUID]).toMatchObject({
      applications: 0,
      refreshes: 0,
      failures: 1,
    });
    expect(state.targets[TARGET_GUID].debugEvents[0]?.type).toBe("failed");
  });

  it("correlates a cast-success event with its aura application", () => {
    const state = faerieFireProcessor.createState();
    const context = createContext();

    faerieFireProcessor.processEvent(
      state,
      createSpellGoEvent(17392, {
        spell: { id: 17392, name: "Faerie Fire (Feral)" },
        numHits: 0,
        numMisses: 0,
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "spell_go",
      context,
    );
    faerieFireProcessor.processEvent(
      state,
      createAuraEvent(17392, {
        spellName: "Faerie Fire (Feral)",
      }),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura",
      context,
    );

    expect(state._pendingCasts).toHaveLength(0);
    expect(state.druids[CASTER_GUID]).toMatchObject({ applications: 1, failures: 0 });
    expect(state.targets[TARGET_GUID].firstApplicationMs).toBe(1010);
  });

  it("honors the selected enemy filter", () => {
    const state = faerieFireProcessor.createState();
    const context = createContext();
    context.entitySelection.enemyIds.add("another-target");

    faerieFireProcessor.processEvent(
      state,
      createAuraCastEvent(9907),
      ENCOUNTER_ID,
      FIRST_TIMESTAMP,
      "aura_cast",
      context,
    );

    expect(state.druids).toEqual({});
    expect(state.targets).toEqual({});
  });
});
