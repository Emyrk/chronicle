import { describe, expect, it } from "vitest";
import { HitTypePartialAbsorb } from "@/lib/hittype/hittype";
import type { DamageProcessorEvent, ProcessorContext, SlainProcessorEvent } from "../processorTypes";
import {
  assemblyRankedDamageProcessor,
  rankedDamageForEncounter,
} from "./assemblyRankedDamage.processor";

const PLAYER = "0x0000000000001234";
const PET = "0xF140000063000001";
const STEELBREAKER = "0xF130008063000001";
const MOLGEIM = "0xF13000809F000002";

function context(): ProcessorContext {
  return {
    players: {
      [PLAYER]: { name: "Player", class: "WARRIOR" },
    },
    units: {
      [PET]: { name: "Pet", owner: PLAYER, entry: 99 },
      [STEELBREAKER]: { name: "Steelbreaker", owner: null, entry: 32867 },
      [MOLGEIM]: { name: "Runemaster Molgeim", owner: null, entry: 32927 },
    },
    selectedEncounterIds: new Set(["encounter"]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
  };
}

function damage(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
  return {
    type: "damage",
    index: 0,
    offsetMilli: 0,
    caster: PLAYER,
    sourceName: "Attack",
    target: STEELBREAKER,
    hitType: 0,
    amount: 100,
    schools: [2],
    tailers: [],
    tailerCount: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellId: null,
    spellAttackOutcome: null,
    overkill: 0,
    ...overrides,
  };
}

function slain(target: string): SlainProcessorEvent {
  return {
    type: "slain",
    index: 1,
    offsetMilli: 1,
    target,
    caster: PLAYER,
    attribution: null,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
  };
}

describe("assemblyRankedDamageProcessor", () => {
  it("commits only damage to the council member killed in each phase", () => {
    const state = assemblyRankedDamageProcessor.createState();
    const ctx = context();

    assemblyRankedDamageProcessor.processEvent(state, damage({ amount: 500 }), "encounter", new Date(), "damage", ctx);
    assemblyRankedDamageProcessor.processEvent(state, damage({ target: MOLGEIM, amount: 80 }), "encounter", new Date(), "damage", ctx);
    assemblyRankedDamageProcessor.processEvent(state, slain(STEELBREAKER), "encounter", new Date(), "slain", ctx);

    expect(rankedDamageForEncounter(state, "encounter").get(PLAYER)).toBe(500);
  });

  it("includes every unresolved bucket for wipes and resets", () => {
    const state = assemblyRankedDamageProcessor.createState();
    const ctx = context();

    assemblyRankedDamageProcessor.processEvent(state, damage({ amount: 500 }), "encounter", new Date(), "damage", ctx);
    assemblyRankedDamageProcessor.processEvent(state, damage({ target: MOLGEIM, amount: 80 }), "encounter", new Date(), "damage", ctx);

    expect(rankedDamageForEncounter(state, "encounter").get(PLAYER)).toBe(580);
  });

  it("merges pet damage into the owning player, includes absorbs, and does not subtract overkill", () => {
    const state = assemblyRankedDamageProcessor.createState();
    const ctx = context();

    assemblyRankedDamageProcessor.processEvent(state, damage({
      caster: PET,
      amount: 80,
      overkill: 50,
      tailers: [{ amount: 20, hitType: HitTypePartialAbsorb }],
      tailerCount: 1,
    }), "encounter", new Date(), "damage", ctx);
    assemblyRankedDamageProcessor.processEvent(state, slain(STEELBREAKER), "encounter", new Date(), "slain", ctx);

    expect(rankedDamageForEncounter(state, "encounter").get(PLAYER)).toBe(100);
  });
});
