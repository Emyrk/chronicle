import { describe, expect, it } from "vitest";
import type {
  ProcessorContext,
  SpellFailProcessorEvent,
  SpellGoProcessorEvent,
} from "../processorTypes";
import {
  aggregateSpellCountsForPlayer,
  spellCountProcessor,
} from "./spellCount.processor";

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
    units: {
      [ENEMY]: { name: "Enemy Caster", owner: null, entry: 1 },
    },
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
    const playerCounts = counts?.get(PLAYER);
    expect(playerCounts).toMatchObject({
      playerID: PLAYER,
      playerName: "Mage",
      className: "MAGE",
      successful: 2,
      failed: 1,
    });
    expect(playerCounts?.spells.get("133:Fireball")).toEqual({
      spellId: 133,
      spellName: "Fireball",
      successful: 2,
      failed: 1,
    });
    expect(counts?.get(OTHER_PLAYER)).toMatchObject({ successful: 1, failed: 0 });
  });

  it("aggregates per-spell counts across selected encounters for breakouts", () => {
    const state = spellCountProcessor.createState();
    const ctx = context();
    ctx.selectedEncounterIds.add("encounter-2");
    const timestamp = new Date("2026-08-26T00:00:00Z");

    spellCountProcessor.processEvent(state, spellGo(), "encounter-1", timestamp, "spell_go", ctx);
    spellCountProcessor.processEvent(
      state,
      spellFail({ spell: { id: 116, name: "Frostbolt" } }),
      "encounter-1",
      timestamp,
      "spell_fail",
      ctx,
    );
    spellCountProcessor.processEvent(state, spellGo(), "encounter-2", timestamp, "spell_go", ctx);
    spellCountProcessor.processEvent(state, spellFail(), "encounter-2", timestamp, "spell_fail", ctx);

    const aggregated = aggregateSpellCountsForPlayer(
      state,
      PLAYER,
      ["encounter-1", "encounter-2"],
    );

    expect(aggregated).toMatchObject({ successful: 2, failed: 2 });
    expect(aggregated?.spells.get("133:Fireball")).toMatchObject({ successful: 2, failed: 1 });
    expect(aggregated?.spells.get("116:Frostbolt")).toMatchObject({ successful: 0, failed: 1 });
  });

  it("ignores unselected encounters but can count non-player casters when filters allow them", () => {
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

    expect(state.EncounterSpellCounts.has("encounter-2")).toBe(false);
    expect(state.EncounterSpellCounts.get("encounter-1")?.get(ENEMY)).toMatchObject({
      playerName: "Enemy Caster",
      className: "UNKNOWN",
      successful: 1,
      failed: 0,
    });
  });
});
