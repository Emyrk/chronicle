import { describe, expect, it } from "vitest";
import { HitTypeCrit, HitTypeHit, HitTypePartialAbsorb } from "@/lib/hittype/hittype";
import type { DamageProcessorEvent, ProcessorContext, SlainProcessorEvent } from "../processorTypes";
import { assemblyDamageDoneProcessor } from "./assemblyDamageDone.processor";

const PLAYER = "0x0000000000001234";
const STEELBREAKER = "0xF130008063000001";
const MOLGEIM = "0xF13000809F000002";
const OTHER_TARGET = "0xF130008159000003";
const ENCOUNTER = "assembly";

function context(staticMode = true): ProcessorContext {
  return {
    players: {
      [PLAYER]: { name: "Player", class: "WARRIOR" },
    },
    units: {
      [STEELBREAKER]: { name: "Steelbreaker", owner: null, entry: 32867 },
      [MOLGEIM]: { name: "Runemaster Molgeim", owner: null, entry: 32927 },
      [OTHER_TARGET]: { name: "Other", owner: null, entry: 33113 },
    },
    selectedEncounterIds: new Set([ENCOUNTER]),
    entitySelection: {
      enemyIds: new Set(),
      playerIds: new Set(),
    },
    panelContext: {
      assemblyEncounterIds: [ENCOUNTER],
      assemblyStaticMode: staticMode,
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

function encounterDamage(
  state: ReturnType<typeof assemblyDamageDoneProcessor.createState>,
  excluded = false,
): number {
  const encounter = excluded
    ? state.EncounterExcludedDamage?.get(ENCOUNTER)
    : state.EncounterDamage.get(ENCOUNTER);
  return Array.from(encounter?.get(PLAYER)?.target.values() ?? [])
    .reduce((sum, amount) => sum + amount, 0);
}

describe("assemblyDamageDoneProcessor", () => {
  it("commits the slain member and retains survivor damage as excluded", () => {
    const state = assemblyDamageDoneProcessor.createState();
    const ctx = context();

    assemblyDamageDoneProcessor.processEvent(state, damage({ amount: 500, hitType: HitTypeHit }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, damage({ target: MOLGEIM, amount: 80, hitType: HitTypeCrit }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, slain(STEELBREAKER), ENCOUNTER, new Date(), "slain", ctx);

    expect(encounterDamage(state)).toBe(500);
    expect(state.ExcludedByAbility?.get(PLAYER)?.get("Attack")).toMatchObject({
      Total: 80,
      Count: 1,
      Hits: 1,
      Crits: 1,
    });
    expect(state.ExcludedByTarget?.get(PLAYER)?.get(MOLGEIM)).toBe(80);
    expect(encounterDamage(state, true)).toBe(80);
  });

  it("includes absorbed damage and does not subtract overkill in static mode", () => {
    const state = assemblyDamageDoneProcessor.createState();
    const ctx = context();

    assemblyDamageDoneProcessor.processEvent(state, damage({
      amount: 80,
      overkill: 50,
      tailers: [{ amount: 20, hitType: HitTypePartialAbsorb }],
      tailerCount: 1,
    }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, slain(STEELBREAKER), ENCOUNTER, new Date(), "slain", ctx);

    expect(encounterDamage(state)).toBe(100);
  });

  it("commits every unresolved target when the encounter ends", () => {
    const state = assemblyDamageDoneProcessor.createState();
    const ctx = context();

    assemblyDamageDoneProcessor.processEvent(state, damage({ amount: 500 }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, damage({ target: MOLGEIM, amount: 80 }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.finalizeEncounter?.(state, ENCOUNTER, ctx);

    expect(encounterDamage(state)).toBe(580);
    expect(encounterDamage(state, true)).toBe(0);
  });

  it("uses ordinary raw Damage Done behavior during replay", () => {
    const state = assemblyDamageDoneProcessor.createState();
    const ctx = context(false);

    assemblyDamageDoneProcessor.processEvent(state, damage({ amount: 100, overkill: 40 }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, damage({ target: MOLGEIM, amount: 80 }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, slain(STEELBREAKER), ENCOUNTER, new Date(), "slain", ctx);

    expect(encounterDamage(state)).toBe(140);
    expect(encounterDamage(state, true)).toBe(0);
  });

  it("recognizes Assembly targets from their GUID when unit metadata is missing", () => {
    const state = assemblyDamageDoneProcessor.createState();
    const ctx = context();
    ctx.units = {};

    assemblyDamageDoneProcessor.processEvent(state, damage({ amount: 90 }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, slain(STEELBREAKER), ENCOUNTER, new Date(), "slain", ctx);

    expect(encounterDamage(state)).toBe(90);
  });

  it("passes non-Assembly encounters and targets directly through", () => {
    const state = assemblyDamageDoneProcessor.createState();
    const ctx = context();

    assemblyDamageDoneProcessor.processEvent(state, damage({ target: OTHER_TARGET, amount: 75 }), ENCOUNTER, new Date(), "damage", ctx);
    assemblyDamageDoneProcessor.processEvent(state, damage({ amount: 25 }), "other-encounter", new Date(), "damage", ctx);

    expect(encounterDamage(state)).toBe(75);
    expect(
      Array.from(state.EncounterDamage.get("other-encounter")?.get(PLAYER)?.target.values() ?? [])
        .reduce((sum, amount) => sum + amount, 0),
    ).toBe(25);
  });
});
