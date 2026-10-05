import { describe, expect, it } from "vitest";
import { HitTypeHit, HitTypePartialAbsorb } from "@/lib/hittype/hittype";
import type { AbsorbedProcessorEvent, DamageProcessorEvent, ProcessorContext } from "../processorTypes";
import { absorbedDamageProcessor } from "./absorbedDamage.processor";

const PLAYER_ID = "0x0000000000000001";
const PRIEST_ID = "0x0000000000000002";
const ENEMY_ID = "0xF130000000000001";

function createContext(): ProcessorContext {
  return {
    players: {
      [PLAYER_ID]: { name: "Tank", class: "WARRIOR" },
      [PRIEST_ID]: { name: "Priest", class: "PRIEST" },
    },
    units: {
      [ENEMY_ID]: { name: "Boss", owner: null, entry: 1 },
    },
    selectedEncounterIds: new Set(["enc1"]),
    entitySelection: {
      playerIds: new Set(),
      enemyIds: new Set(),
    },
  };
}

function createDamageEvent(absorbed: number): DamageProcessorEvent {
  return {
    type: "damage",
    index: 0,
    offsetMilli: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: ENEMY_ID,
    sourceName: "Melee",
    target: PLAYER_ID,
    hitType: HitTypeHit,
    amount: 500,
    schools: [1],
    tailers: [{ amount: absorbed, hitType: HitTypePartialAbsorb }],
    tailerCount: 1,
    spellId: null,
    spellAttackOutcome: null,
    overkill: 0,
  };
}

function createAbsorbedEvent(overrides: Partial<AbsorbedProcessorEvent> = {}): AbsorbedProcessorEvent {
  return {
    type: "absorbed",
    index: 1,
    offsetMilli: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    attacker: ENEMY_ID,
    target: PLAYER_ID,
    damageSpellId: null,
    damageSpellName: "Melee",
    caster: PRIEST_ID,
    absorbSpellId: 17,
    absorbSpellName: "Power Word: Shield",
    absorbSchools: [1],
    amount: 700,
    estimated: true,
    ...overrides,
  };
}

describe("absorbedDamageProcessor", () => {
  it("keeps damage tailers as the canonical total and records absorb attribution separately", () => {
    const state = absorbedDamageProcessor.createState();
    const context = createContext();

    absorbedDamageProcessor.processEvent(state, createDamageEvent(1_000), "enc1", new Date(), "damage", context);
    absorbedDamageProcessor.processEvent(state, createAbsorbedEvent(), "enc1", new Date(), "absorbed", context);

    expect(state.EncounterAbsorbed.get("enc1")?.get(PLAYER_ID)?.totalAbsorbed).toBe(1_000);

    const attribution = state.EncounterAttribution.get("enc1")?.get(PLAYER_ID);
    expect(attribution?.byAbility.get("Power Word: Shield")).toEqual({
      amount: 700,
      count: 1,
      spellId: 17,
    });
    expect(attribution?.bySource.get(PRIEST_ID)).toBe(700);
  });

  it("uses unknown buckets when an attributed event lacks spell or caster data", () => {
    const state = absorbedDamageProcessor.createState();
    const context = createContext();

    absorbedDamageProcessor.processEvent(
      state,
      createAbsorbedEvent({ caster: "", absorbSpellId: null, absorbSpellName: null, amount: 250 }),
      "enc1",
      new Date(),
      "absorbed",
      context,
    );

    const attribution = state.EncounterAttribution.get("enc1")?.get(PLAYER_ID);
    expect(attribution?.byAbility.get("Unknown")?.amount).toBe(250);
    expect(attribution?.bySource.get("__unknown__")).toBe(250);
  });
});
