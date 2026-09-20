import { describe, expect, it } from "vitest";
import {
  materializeActiveUnitAuras,
  unitAurasProcessor,
  unitAuraUptimeDurationMs,
} from "./unitAuras.processor";
import {
  AuraApplication,
  AuraState,
  AuraTransition,
  type AuraProcessorEvent,
  type ProcessorContext,
  type ResurrectionProcessorEvent,
  type SlainProcessorEvent,
} from "../processorTypes";

const TARGET = "0xF130000001000001";
const CASTER = "0x0000000000000001";

function context(): ProcessorContext {
  return {
    players: {
      [CASTER]: { name: "Brannor", class: "Priest" },
    },
    units: {
      [TARGET]: { name: "Solnius", owner: null, entry: 9999 },
    },
    selectedEncounterIds: new Set(["enc1", "enc2"]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
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

function slain(overrides: Partial<SlainProcessorEvent> = {}): SlainProcessorEvent {
  return {
    type: "slain",
    index: 2,
    offsetMilli: 7500,
    target: CASTER,
    caster: TARGET,
    attribution: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    ...overrides,
  };
}

function resurrection(overrides: Partial<ResurrectionProcessorEvent> = {}): ResurrectionProcessorEvent {
  return {
    type: "ressurection",
    index: 3,
    offsetMilli: 8500,
    source: TARGET,
    target: CASTER,
    spell: { id: 20484, name: "Rebirth" },
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    ...overrides,
  };
}

function process(
  event: AuraProcessorEvent | SlainProcessorEvent | ResurrectionProcessorEvent,
  state = unitAurasProcessor.createState(),
  encounterId = "enc1",
) {
  unitAurasProcessor.processEvent(state, event, encounterId, new Date(0), event.type, context());
  return state;
}

describe("unitAurasProcessor", () => {
  it("records buff and debuff uptime with their sources", () => {
    const state = unitAurasProcessor.createState();

    process(aura(), state);
    process(aura({
      index: 2,
      offsetMilli: 5000,
      amount: 0,
      application: AuraApplication.Fades,
      state: AuraState.Removed,
      transition: AuraTransition.Removed,
    }), state);

    process(aura({
      index: 3,
      offsetMilli: 1000,
      spellName: "Rend",
      spellId: 772,
      isBuff: false,
    }), state);
    process(aura({
      index: 4,
      offsetMilli: 3000,
      spellName: "Rend",
      spellId: 772,
      isBuff: false,
      amount: 0,
      application: AuraApplication.Fades,
      state: AuraState.Removed,
      transition: AuraTransition.Removed,
    }), state);

    const unit = state.byUnit.get(TARGET);
    expect(unit?.name).toBe("Solnius");
    expect(unit?.auras.get("id:1243")).toMatchObject({
      isBuff: true,
      totalUptimeMs: 5000,
      applicationCount: 1,
    });
    expect(unit?.auras.get("id:772")).toMatchObject({
      isBuff: false,
      totalUptimeMs: 2000,
      applicationCount: 1,
    });
    expect(unit?.auras.get("id:1243")?.segments[0]).toEqual({
      startMs: 0,
      endMs: 5000,
      encounterId: "enc1",
      sourceGuid: CASTER,
      sourceName: "Brannor",
    });
  });

  it("preserves the source through source-less stack changes", () => {
    const state = unitAurasProcessor.createState();
    process(aura(), state);
    process(aura({
      index: 2,
      offsetMilli: 2000,
      caster: null,
      amount: 2,
      state: AuraState.Modified,
      transition: AuraTransition.StackChanged,
    }), state);
    process(aura({
      index: 3,
      offsetMilli: 6000,
      caster: null,
      amount: 0,
      state: AuraState.Removed,
      transition: AuraTransition.Removed,
    }), state);

    const fortitude = state.byUnit.get(TARGET)?.auras.get("id:1243");
    expect(fortitude?.segments).toHaveLength(1);
    expect(fortitude?.segments[0].sourceGuid).toBe(CASTER);
    expect(fortitude?.totalUptimeMs).toBe(6000);
  });

  it("splits refreshes so source changes remain visible", () => {
    const state = unitAurasProcessor.createState();
    process(aura(), state);
    process(aura({
      index: 2,
      offsetMilli: 3000,
      caster: null,
      transition: AuraTransition.Refreshed,
    }), state);
    process(aura({
      index: 3,
      offsetMilli: 7000,
      caster: null,
      amount: 0,
      state: AuraState.Removed,
      transition: AuraTransition.Removed,
    }), state);

    const segments = state.byUnit.get(TARGET)?.auras.get("id:1243")?.segments;
    expect(segments).toEqual([
      {
        startMs: 0,
        endMs: 3000,
        encounterId: "enc1",
        sourceGuid: CASTER,
        sourceName: "Brannor",
      },
      {
        startMs: 3000,
        endMs: 7000,
        encounterId: "enc1",
        sourceGuid: null,
        sourceName: null,
      },
    ]);
  });

  it("materializes active auras at exact encounter ends without mutating state", () => {
    const state = unitAurasProcessor.createState();
    process(aura({ isSynthetic: true }), state, "enc1");
    process(aura({
      index: 2,
      spellName: "Rend",
      spellId: 772,
      isBuff: false,
      caster: null,
    }), state, "enc2");

    const first = materializeActiveUnitAuras(state, new Map([["enc1", 5000], ["enc2", 7000]]));
    const second = materializeActiveUnitAuras(state, new Map([["enc1", 5000], ["enc2", 7000]]));

    expect(first.get(TARGET)?.auras.get("id:1243")?.totalUptimeMs).toBe(5000);
    expect(first.get(TARGET)?.auras.get("id:772")?.totalUptimeMs).toBe(7000);
    expect(second).toEqual(first);
    expect(state.byUnit.size).toBe(0);
  });

  it("excludes time after a player dies from the uptime denominator", () => {
    const state = unitAurasProcessor.createState();
    process(aura({ target: CASTER, caster: CASTER }), state);
    process(slain(), state);

    const encounterEndOffsets = new Map([["enc1", 10_000]]);
    const materialized = materializeActiveUnitAuras(state, encounterEndOffsets);

    expect(materialized.get(CASTER)?.auras.get("id:1243")?.totalUptimeMs).toBe(7500);
    expect(unitAuraUptimeDurationMs(state, CASTER, encounterEndOffsets)).toBe(7500);
    expect(unitAuraUptimeDurationMs(state, TARGET, encounterEndOffsets)).toBe(10_000);
  });

  it("includes time after a player is resurrected in the uptime denominator", () => {
    const state = unitAurasProcessor.createState();
    process(slain({ offsetMilli: 3000 }), state);
    process(resurrection({ offsetMilli: 5000 }), state);

    expect(unitAuraUptimeDurationMs(state, CASTER, new Map([["enc1", 10_000]]))).toBe(8000);
  });

  it("keeps identical aura names with different spell IDs separate", () => {
    const state = unitAurasProcessor.createState();
    process(aura({ spellName: "Blessing", spellId: 1 }), state);
    process(aura({ spellName: "Blessing", spellId: 2 }), state);

    const materialized = materializeActiveUnitAuras(state, new Map([["enc1", 4000]]));
    const auras = materialized.get(TARGET)?.auras;
    expect(auras?.has("id:1")).toBe(true);
    expect(auras?.has("id:2")).toBe(true);
  });
});
