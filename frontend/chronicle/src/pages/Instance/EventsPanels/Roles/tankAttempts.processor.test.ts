import { describe, expect, it } from "vitest";
import type { DamageProcessorEvent, ProcessorContext } from "../processorTypes";
import { tankAttemptsProcessor } from "./tankAttempts.processor";

const player = "0x0000000000001234";
const boss = "0xF130000CE0000001";
const pet = "0xF140000CE0000002";

function context(): ProcessorContext {
  return {
    players: { [player]: { name: "Tank", class: "WARRIOR" } },
    units: {
      [boss]: { name: "Boss", owner: null, entry: 12345 },
      [pet]: { name: "Pet", owner: player, entry: 99 },
    },
    selectedEncounterIds: new Set(["encounter"]),
    entitySelection: { enemyIds: new Set(), playerIds: new Set() },
  };
}

function damage(overrides: Partial<DamageProcessorEvent> = {}): DamageProcessorEvent {
  return {
    type: "damage",
    index: 0,
    offsetMilli: 0,
    caster: boss,
    sourceName: "Auto Attack",
    target: player,
    hitType: 0,
    amount: 0,
    school: 1,
    tailers: [],
    tailerCount: 0,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    spellId: 6603,
    spellAttackOutcome: null,
    overkill: 0,
    ...overrides,
  };
}

function process(event: DamageProcessorEvent) {
  const state = tankAttemptsProcessor.createState();
  tankAttemptsProcessor.processEvent(state, event, "encounter", new Date(0), "damage", context());
  return state;
}

describe("tankAttemptsProcessor", () => {
  it("counts zero-damage Auto Attack attempts by normalized name", () => {
    const state = process(damage({ spellId: null, amount: 0 }));
    expect(state.counts.get("encounter")?.get(boss)?.get(player)).toBe(1);
  });

  it("counts Auto Attack spell ID 6603 when the name is unavailable", () => {
    const state = process(damage({ sourceName: "", spellId: 6603 }));
    expect(state.counts.get("encounter")?.get(boss)?.get(player)).toBe(1);
  });

  it("ignores spell damage, player attacks, and player-owned attacks", () => {
    const state = tankAttemptsProcessor.createState();
    const ctx = context();
    const events = [
      damage({ sourceName: "Cleave", spellId: 845, amount: 1000 }),
      damage({ caster: player }),
      damage({ caster: pet }),
    ];
    for (const event of events) {
      tankAttemptsProcessor.processEvent(state, event, "encounter", new Date(0), "damage", ctx);
    }
    expect(state.counts.size).toBe(0);
  });
});
