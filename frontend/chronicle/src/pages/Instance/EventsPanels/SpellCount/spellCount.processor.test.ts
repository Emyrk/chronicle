import { describe, expect, it } from "vitest";
import type {
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
} from "../processorTypes";
import { spellCountProcessor } from "./spellCount.processor";

const PLAYER = "0x0000000000000001";
const OTHER_PLAYER = "0x0000000000000002";
const ENEMY = "0xF130000000000001";

function context(): ProcessorContext {
  return {
    players: {
      [PLAYER]: { name: "Mage", class: "MAGE" },
      [OTHER_PLAYER]: { name: "Priest", class: "PRIEST" },
    },
    selectedEncounterIds: new Set(["encounter-1"]),
    entitySelection: { playerIds: new Set(), enemyIds: new Set() },
  };
}

function spellGo(overrides: Partial<SpellGoProcessorEvent> = {}): SpellGoProcessorEvent {
  return {
    type: "spell_go",
    index: 1,
    offsetMilli: 1_000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: PLAYER,
    target: ENEMY,
    spell: { id: 133, name: "Fireball" },
    numHits: 1,
    numMisses: 0,
    itemId: null,
    corpseOwner: null,
    ...overrides,
  };
}

function spellFail(overrides: Partial<SpellFailProcessorEvent> = {}): SpellFailProcessorEvent {
  return {
    type: "spell_fail",
    index: 2,
    offsetMilli: 2_000,
    activity: [],
    activityCount: 0,
    isSynthetic: false,
    caster: PLAYER,
    spell: { id: 133, name: "Fireball" },
    failedByServer: false,
    ...overrides,
  };
}

describe("spellCountProcessor", () => {
  it("counts SpellGo and SpellFail events separately by caster", () => {
    const state = spellCountProcessor.createState();
    const ctx = context();
    const timestamp = new Date("2026-08-26T00:00:00Z");

    spellCountProcessor.processEvent(state, spellGo(), "encounter-1", timestamp, "spell_go", ctx);
    spellCountProcessor.processEvent(state, spellGo({ index: 3 }), "encounter-1", timestamp, "spell_go", ctx);
    spellCountProcessor.processEvent(state, spellFail(), "encounter-1", timestamp, "spell_fail", ctx);
    spellCountProcessor.processEvent(
      state,
      spellGo({ caster: OTHER_PLAYER, spell: { id: 2061, name: "Flash Heal" } }),
      "encounter-1",
      timestamp,
      "spell_go",
      ctx,
    );

    const counts = state.EncounterSpellCounts.get("encounter-1");
    expect(counts?.get(PLAYER)).toEqual({
      playerID: PLAYER,
      playerName: "Mage",
      className: "MAGE",
      successful: 2,
      failed: 1,
    });
    expect(counts?.get(OTHER_PLAYER)).toMatchObject({ successful: 1, failed: 0 });
  });

  it("ignores events outside selected encounters and non-player casters", () => {
    const state = spellCountProcessor.createState();
    const ctx = context();
    const timestamp = new Date("2026-08-26T00:00:00Z");

    spellCountProcessor.processEvent(state, spellGo(), "encounter-2", timestamp, "spell_go", ctx);
    spellCountProcessor.processEvent(
      state,
      spellGo({ caster: ENEMY }),
      "encounter-1",
      timestamp,
      "spell_go",
      ctx,
    );

    expect(state.EncounterSpellCounts.size).toBe(0);
  });
});
