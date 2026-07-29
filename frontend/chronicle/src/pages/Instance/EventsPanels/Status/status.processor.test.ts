import { describe, expect, it } from "vitest";
import type {
  DamageProcessorEvent,
  HealProcessorEvent,
  ProcessorContext,
  SpellStartProcessorEvent,
} from "../processorTypes";
import { statusProcessor } from "./status.processor";

const PLAYER = "0x0000000000000001";
const ENEMY = "0xF130000000000001";

function context(): ProcessorContext {
  return {
    players: { [PLAYER]: { name: "Tank", class: "WARRIOR" } },
    units: { [ENEMY]: { name: "Boss", owner: null, entry: 1 } },
    selectedEncounterIds: new Set(["encounter-1"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function damage(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
  return {
    type: "damage",
    index: 1,
    offsetMilli: 1_000,
    activity: [],
    activityCount: 0,
    caster: ENEMY,
    sourceName: "Melee",
    target: PLAYER,
    hitType: 0,
    amount: 400,
    school: 0,
    tailers: [],
    tailerCount: 0,
    spellId: 6603,
    spellAttackOutcome: null,
    overkill: 0,
    ...overrides,
  };
}

function heal(overrides: Partial<HealProcessorEvent> = {}): HealProcessorEvent {
  return {
    type: "heal",
    index: 2,
    offsetMilli: 2_000,
    activity: [],
    activityCount: 0,
    caster: PLAYER,
    sourceName: "Heal",
    target: PLAYER,
    hitType: 0,
    amount: 250,
    overheal: 50,
    absorbed: 0,
    school: 0,
    spellId: 1,
    spellAttackOutcome: null,
    ...overrides,
  };
}

function spellStart(overrides: Partial<SpellStartProcessorEvent> = {}): SpellStartProcessorEvent {
  return {
    type: "spell_start",
    index: 3,
    offsetMilli: 3_000,
    activity: [],
    activityCount: 0,
    caster: PLAYER,
    target: ENEMY,
    spell: { id: 2, name: "Shield Slam" },
    itemId: null,
    castFlags: 0,
    castTimeMilli: 1_500,
    channelTimeMilli: 0,
    spellType: 0,
    ...overrides,
  };
}

describe("statusProcessor", () => {
  it("builds a generic unit timeline from health and cast events", () => {
    const state = statusProcessor.createState();
    const firstTimestamp = new Date("2026-01-01T00:00:00Z");
    const ctx = context();

    statusProcessor.processEvent(state, damage(), "encounter-1", firstTimestamp, "damage", ctx);
    statusProcessor.processEvent(state, heal(), "encounter-1", firstTimestamp, "heal", ctx);
    statusProcessor.processEvent(state, spellStart(), "encounter-1", firstTimestamp, "spell_start", ctx);

    const encounter = state.encounters.get("encounter-1");
    const unit = encounter?.units.get(PLAYER);
    expect(encounter?.startMilli).toBe(firstTimestamp.getTime());
    expect(unit).toMatchObject({
      unitId: PLAYER,
      name: "Tank",
      className: "WARRIOR",
      kind: "player",
    });
    expect(unit?.events.map((event) => event.kind)).toEqual(["damage", "heal", "cast_start"]);
    expect(unit?.events[1]).toMatchObject({ amount: 250, overheal: 50 });
    expect(unit?.events[2]).toMatchObject({ label: "Shield Slam", durationMilli: 1_500 });
  });

  it("keeps encounters independent", () => {
    const state = statusProcessor.createState();
    const ctx = context();
    ctx.selectedEncounterIds.add("encounter-2");

    statusProcessor.processEvent(state, damage(), "encounter-1", new Date(1_000), "damage", ctx);
    statusProcessor.processEvent(state, damage({ amount: 900 }), "encounter-2", new Date(10_000), "damage", ctx);

    expect(state.encounters.get("encounter-1")?.units.get(PLAYER)?.events[0].amount).toBe(400);
    expect(state.encounters.get("encounter-2")?.units.get(PLAYER)?.events[0].amount).toBe(900);
  });

  it("ignores events from unselected encounters", () => {
    const state = statusProcessor.createState();
    statusProcessor.processEvent(state, damage(), "other", new Date(0), "damage", context());
    expect(state.encounters.size).toBe(0);
  });
});
