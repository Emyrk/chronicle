import { describe, expect, it } from "vitest";
import { deriveCapabilities } from "./capabilities";
import {
  FIXTURE_DURATION_MS,
  getFixtureInstance,
  getFixtureParsePillsMap,
  getFixtureResult,
  getFixtureSpellDataMap,
} from "./fixture";

describe("damage done fixture", () => {
  it("derives every capability except multi-encounter (single fixture encounter)", () => {
    const caps = deriveCapabilities(
      getFixtureResult(),
      FIXTURE_DURATION_MS,
      getFixtureInstance(),
    );
    expect(caps).toEqual({
      hasMultiplePlayers: true,
      hasAbilityBreakout: true,
      hasTargetBreakout: true,
      hasDetailedStats: true,
      hasSpellRanks: true,
      hasFocusTarget: true,
      hasDuration: true,
      hasMultipleEncounters: false,
      hasPets: true,
    });
  });

  it("gives every roster player a parse pill and matching chart data", () => {
    const result = getFixtureResult();
    const pills = getFixtureParsePillsMap();
    const units = [...result.EncounterDamage.values()][0]!;
    let players = 0;
    for (const unitId of units.keys()) {
      if (unitId.startsWith("0x0000")) {
        players++;
        expect(pills.has(unitId), `pill for ${unitId}`).toBe(true);
      }
    }
    expect(players).toBe(12);
  });

  it("covers all fixture spell IDs with spell-data overrides", () => {
    const result = getFixtureResult();
    const spellData = getFixtureSpellDataMap();
    for (const spells of result.ByAbilityBySpellId.values()) {
      for (const spellId of spells.keys()) {
        const realId = spellId >= 1_000_000 ? spellId - 1_000_000 : spellId;
        expect(spellData.has(realId), `spell data for ${realId}`).toBe(true);
      }
    }
  });

  it("keeps ByTarget totals consistent with player totals", () => {
    const result = getFixtureResult();
    const units = [...result.EncounterDamage.values()][0]!;
    for (const [unitId, data] of units) {
      const targets = result.ByTarget.get(unitId);
      expect(targets, `targets for ${data.playerName}`).toBeDefined();
      const sum = [...targets!.values()].reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
    }
  });
});
