import { describe, expect, it } from "vitest";
import { HitTypeCrit, HitTypeHit } from "@/lib/hittype/hittype";
import type { ActivityLogProcessorEvent } from "./activityLog.processor";
import type { ProcessorContext } from "../processorTypes";
import { AuraTransition } from "../processorTypes";
import { activityLogProcessor, activityMatches, recentActivity, type ActivityEntry } from "./activityLog.processor";

const PLAYER = "0x0000000000000001";
const BOSS = "0xF130000000000001";
const ENCOUNTER = "encounter-1";
const START = new Date("2026-01-01T00:00:00Z");
const meta = { index: 1, activity: [], activityCount: 0, isSynthetic: false };

const context: ProcessorContext = {
  players: { [PLAYER]: { name: "Mage", class: "MAGE" } } as ProcessorContext["players"],
  selectedEncounterIds: new Set([ENCOUNTER]),
  entitySelection: { playerIds: new Set(), enemyIds: new Set() },
};

function run(events: ActivityLogProcessorEvent[]) {
  const state = activityLogProcessor.createState();
  for (const event of events) activityLogProcessor.processEvent(state, event, ENCOUNTER, START, "damage", context);
  return state.encounters.get(ENCOUNTER)?.entries ?? [];
}

const damage = (offsetMilli: number, amount: number, hitType = HitTypeHit) => ({
  ...meta, offsetMilli, type: "damage" as const, caster: PLAYER, sourceName: "Frostbolt", target: BOSS, hitType, amount,
  schools: [16], tailers: [], tailerCount: 0, spellId: 116, spellAttackOutcome: null, overkill: 0,
});

describe("activityLogProcessor", () => {
  it("keeps landed damage, effective heals, casts (not auto attacks), aura gains and fades, and deaths", () => {
    const entries = run([
      damage(100, 500, HitTypeCrit),
      damage(150, 0),
      { ...meta, offsetMilli: 200, type: "heal", caster: PLAYER, sourceName: "Heal", target: PLAYER, hitType: 0, amount: 800, overheal: 300, absorbed: 0, schools: [2], spellId: 2054, spellAttackOutcome: null },
      { ...meta, offsetMilli: 300, type: "spell_go", caster: BOSS, target: PLAYER, spell: { id: 999, name: "Shadow Bolt" }, numHits: 1, numMisses: 0, itemId: null, corpseOwner: null } as ActivityLogProcessorEvent,
      { ...meta, offsetMilli: 310, type: "spell_go", caster: PLAYER, target: BOSS, spell: { id: 6603, name: "Auto Attack" }, numHits: 1, numMisses: 0, itemId: null, corpseOwner: null } as ActivityLogProcessorEvent,
      { ...meta, offsetMilli: 400, type: "aura", target: PLAYER, caster: PLAYER, spellName: "Ice Barrier", spellId: 11426, spellAttackOutcome: null, amount: 1, application: 0, state: 1, transition: AuraTransition.Applied, isBuff: true } as ActivityLogProcessorEvent,
      { ...meta, offsetMilli: 410, type: "aura", target: PLAYER, caster: PLAYER, spellName: "Ice Barrier", spellId: 11426, spellAttackOutcome: null, amount: 1, application: 0, state: 3, transition: AuraTransition.Refreshed, isBuff: true } as ActivityLogProcessorEvent,
      { ...meta, offsetMilli: 500, type: "slain", target: PLAYER, caster: BOSS, attribution: null },
    ]);
    expect(entries.map((line) => line.kind)).toEqual(["damage", "heal", "cast", "aura_gain", "death"]);
    expect(entries[0]).toMatchObject({ amount: 500, crit: true, spellName: "Frostbolt" });
    expect(entries[1]).toMatchObject({ amount: 500, overheal: 300 });
  });
});

describe("activity filters", () => {
  const line = (overrides: Partial<ActivityEntry>): ActivityEntry => ({
    timestampMs: 0, kind: "damage", source: PLAYER, target: BOSS, spellId: null, spellName: "", amount: 1, overheal: 0, crit: false, school: 0, isBuff: false, ...overrides,
  });
  const isPlayer = (guid: string) => guid === PLAYER;

  it("highlights crits, deaths, interrupts, resurrects and enemy casts", () => {
    expect(activityMatches(line({ crit: true }), "highlights", isPlayer)).toBe(true);
    expect(activityMatches(line({}), "highlights", isPlayer)).toBe(false);
    expect(activityMatches(line({ kind: "death" }), "highlights", isPlayer)).toBe(true);
    expect(activityMatches(line({ kind: "cast", source: BOSS }), "highlights", isPlayer)).toBe(true);
    expect(activityMatches(line({ kind: "cast", source: PLAYER }), "highlights", isPlayer)).toBe(false);
    expect(activityMatches(line({ kind: "aura_fade" }), "auras", isPlayer)).toBe(true);
    // A pet is friendly: its casts are not enemy casts.
    expect(activityMatches(line({ kind: "cast", source: "pet" }), "highlights", (guid) => guid === PLAYER || guid === "pet")).toBe(false);
  });

  it("returns the newest matching entries at or before the cursor, newest first", () => {
    const entries = [10, 20, 30, 40].map((timestampMs) => line({ timestampMs }));
    expect(recentActivity(entries, 30, 2, () => true).map((entry) => entry.timestampMs)).toEqual([30, 20]);
    expect(recentActivity(entries, 5, 2, () => true)).toEqual([]);
  });
});
