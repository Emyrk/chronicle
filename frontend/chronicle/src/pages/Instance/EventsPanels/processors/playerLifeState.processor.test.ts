import { describe, expect, it } from "vitest";
import { HitTypeHit, HitTypePeriodic } from "@/lib/hittype/hittype";
import type {
  DamageProcessorEvent,
  HealProcessorEvent,
  ProcessorContext,
  ResurrectionProcessorEvent,
  SlainProcessorEvent,
} from "../processorTypes";
import { playerLifeStateProcessor, PlayerLifeStateIndex } from "./playerLifeState.processor";

const PLAYER = "0x0000000000000001";
const OTHER = "0x0000000000000002";
const ENEMY = "0xF130000000000001";
const FIRST = new Date(10_000);

function context(): ProcessorContext {
  return {
    players: {
      [PLAYER]: { name: "Player", class: "PRIEST" },
      [OTHER]: { name: "Other", class: "DRUID" },
    },
    selectedEncounterIds: new Set(["encounter"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function slain(offsetMilli = 1_000): SlainProcessorEvent {
  return {
    type: "slain", index: 1, offsetMilli, target: PLAYER, caster: ENEMY, attribution: null,
    activity: [], activityCount: 0,
  };
}

function resurrection(offsetMilli = 3_000): ResurrectionProcessorEvent {
  return {
    type: "ressurection",
    index: 2,
    offsetMilli,
    source: OTHER,
    target: PLAYER,
    spell: { id: 20484, name: "Rebirth" },
    activity: [],
    activityCount: 0,
  };
}

function damage(offsetMilli: number, hitType = HitTypeHit): DamageProcessorEvent {
  return {
    type: "damage", index: 3, offsetMilli, activity: [], activityCount: 0,
    caster: PLAYER, sourceName: "Smite", target: ENEMY, hitType, amount: 100,
    school: 3, tailers: [], tailerCount: 0, spellId: 585,
    spellAttackOutcome: null, overkill: 0,
  };
}

function heal(offsetMilli: number, hitType = HitTypeHit): HealProcessorEvent {
  return {
    type: "heal", index: 4, offsetMilli, activity: [], activityCount: 0,
    caster: PLAYER, sourceName: "Heal", target: OTHER, hitType, amount: 100,
    overheal: 0, absorbed: 0, school: 3, spellId: 2054,
    spellAttackOutcome: null,
  };
}

function process(events: Array<SlainProcessorEvent | ResurrectionProcessorEvent | DamageProcessorEvent | HealProcessorEvent>) {
  const state = playerLifeStateProcessor.createState();
  for (const event of events) {
    playerLifeStateProcessor.processEvent(state, event, "encounter", FIRST, event.type, context());
  }
  return state;
}

describe("playerLifeStateProcessor", () => {
  it("tracks slain and explicit resurrection transitions", () => {
    const state = process([slain(), resurrection()]);
    const index = new PlayerLifeStateIndex(state.transitions);

    expect(index.deadSince("encounter", PLAYER, 11_000)).toBe(11_000);
    expect(index.isDead("encounter", PLAYER, 12_999)).toBe(true);
    expect(index.isDead("encounter", PLAYER, 13_000)).toBe(false);
    expect(state.transitions.map((transition) => transition.reason)).toEqual(["slain", "ressurection"]);
  });

  it("infers revival from direct outgoing damage or healing after one second", () => {
    const damageState = process([slain(), damage(2_001)]);
    const healState = process([slain(), heal(2_001)]);

    expect(damageState.transitions.at(-1)?.reason).toBe("direct_damage");
    expect(healState.transitions.at(-1)?.reason).toBe("direct_heal");
  });

  it("does not infer revival from immediate or periodic activity", () => {
    expect(process([slain(), damage(2_000)]).transitions).toHaveLength(1);
    expect(process([slain(), damage(3_000, HitTypeHit | HitTypePeriodic)]).transitions).toHaveLength(1);
    expect(process([slain(), heal(3_000, HitTypeHit | HitTypePeriodic)]).transitions).toHaveLength(1);
  });

  it("ignores deaths and activity for non-players", () => {
    const enemyDeath = { ...slain(), target: ENEMY };
    const enemyDamage = { ...damage(3_000), caster: ENEMY };
    expect(process([enemyDeath, enemyDamage]).transitions).toEqual([]);
  });
});
