/**
 * Tests for fixture data correctness and isolation.
 */

import { describe, it, expect } from "vitest";
import {
  getFixtureResult,
  getFixtureRenderProps,
  getFixturePanelContext,
  getFixtureInstance,
  FIXTURE_DURATION_MS,
  FIXTURE_ENCOUNTER_ID,
  FIXTURE_PARSE_PILLS,
} from "./fixture";
import { deriveCapabilities } from "./capabilities";

describe("fixture data", () => {
  it("getFixtureResult returns the same instance on repeated calls", () => {
    const a = getFixtureResult();
    const b = getFixtureResult();
    expect(a).toBe(b); // Same reference — singleton
  });

  it("fixture result supports all lesson capabilities", () => {
    const result = getFixtureResult();
    const caps = deriveCapabilities(result, FIXTURE_DURATION_MS);
    expect(caps.hasMultiplePlayers).toBe(true);
    expect(caps.hasAbilityBreakout).toBe(true);
    expect(caps.hasTargetBreakout).toBe(true);
    expect(caps.hasDetailedStats).toBe(true);
    expect(caps.hasSpellRanks).toBe(true);
    expect(caps.hasFocusTarget).toBe(true);
    expect(caps.hasDuration).toBe(true);
  });

  it("fixture has 5 players", () => {
    const result = getFixtureResult();
    const enc = result.EncounterDamage.get(FIXTURE_ENCOUNTER_ID);
    expect(enc).toBeDefined();
    expect(enc!.size).toBe(5);
  });

  it("fixture has spell rank separation", () => {
    const result = getFixtureResult();
    // Mage should have two Frostbolt spell IDs
    const mageSpells = result.ByAbilityBySpellId.values().next().value;
    expect(mageSpells).toBeDefined();
    const frostboltEntries = [...mageSpells!.entries()].filter(
      ([, v]) => v.spellName === "Frostbolt"
    );
    expect(frostboltEntries.length).toBe(2);
  });

  it("fixture parse pills cover all players", () => {
    const result = getFixtureResult();
    const enc = result.EncounterDamage.get(FIXTURE_ENCOUNTER_ID)!;
    for (const playerId of enc.keys()) {
      expect(FIXTURE_PARSE_PILLS[playerId]).toBeDefined();
    }
  });

  it("fixture instance has the expected encounter", () => {
    const instance = getFixtureInstance();
    expect(instance.encounters).toHaveLength(1);
    expect(instance.encounters[0].id).toBe(FIXTURE_ENCOUNTER_ID);
  });

  it("fixture render props reference fixture context and result", () => {
    const props = getFixtureRenderProps();
    expect(props.durationMs).toBe(FIXTURE_DURATION_MS);
    expect(props.loading).toBe(false);
    expect(props.error).toBeNull();
    expect(props.result.EncounterDamage.size).toBeGreaterThan(0);
  });

  it("fixture panel context includes correct encounter selection", () => {
    const ctx = getFixturePanelContext();
    expect(ctx.selectedEncounterIds).toEqual([FIXTURE_ENCOUNTER_ID]);
    expect(ctx.entitySelection.enemyIds.size).toBe(0);
    expect(ctx.entitySelection.playerIds.size).toBe(0);
  });
});

describe("data-mode isolation", () => {
  it("fixture result does not share references with separate getFixtureRenderProps call contexts", () => {
    const props1 = getFixtureRenderProps();
    const props2 = getFixtureRenderProps();
    // Context objects should be distinct (fresh each call)
    expect(props1.context).not.toBe(props2.context);
    // But the result singleton is the same
    expect(props1.result).toBe(props2.result);
  });

  it("fixture context cannot accidentally select players (empty sets)", () => {
    const ctx = getFixturePanelContext();
    expect(ctx.entitySelection.playerIds.size).toBe(0);
    expect(ctx.entitySelection.enemyIds.size).toBe(0);
    // Should not have callbacks that could mutate external state
    expect(ctx.onSelectEncounters).toBeUndefined();
    expect(ctx.onTogglePlayer).toBeUndefined();
    expect(ctx.onTogglePlayers).toBeUndefined();
  });
});
