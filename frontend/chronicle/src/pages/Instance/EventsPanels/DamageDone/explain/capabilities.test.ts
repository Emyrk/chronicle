import { describe, expect, it } from "vitest";
import { damageDoneProcessor, type DamageDoneResult } from "../damageDone.processor";
import type { SpellIdAbilityBreakout } from "../../processors/abilityBreakout";
import { createEmptyAbilityBreakout } from "../../processors/abilityBreakout";
import type { Instance } from "../../../InstancePage";
import { deriveCapabilities } from "./capabilities";

const PLAYER_A = "0x0000000000000001";
const PLAYER_B = "0x0000000000000002";
const PET_A = "0x0040000000000003";

function emptyResult(): DamageDoneResult {
  return damageDoneProcessor.createState();
}

function addUnitDamage(result: DamageDoneResult, encounterID: string, unitId: string) {
  const enc = result.EncounterDamage.get(encounterID) ?? new Map();
  enc.set(unitId, {
    playerID: unitId,
    playerName: unitId,
    className: "MAGE",
    specialization: "",
    target: new Map(),
  });
  result.EncounterDamage.set(encounterID, enc);
}

function instanceWithEncounters(count: number): Instance {
  return {
    encounters: Array.from({ length: count }, (_, i) => ({ id: `e${i}` })),
  } as unknown as Instance;
}

describe("deriveCapabilities", () => {
  it("returns all-false (except duration/encounters) for a null result", () => {
    const caps = deriveCapabilities(null, 60_000, instanceWithEncounters(2));
    expect(caps).toEqual({
      hasMultiplePlayers: false,
      hasAbilityBreakout: false,
      hasTargetBreakout: false,
      hasDetailedStats: false,
      hasSpellRanks: false,
      hasFocusTarget: false,
      hasDuration: true,
      hasMultipleEncounters: true,
      hasPets: false,
    });
  });

  it("handles zero duration and missing instance", () => {
    const caps = deriveCapabilities(emptyResult(), 0, null);
    expect(caps.hasDuration).toBe(false);
    expect(caps.hasMultipleEncounters).toBe(false);
  });

  it("detects single vs multiple players and focus targets", () => {
    const result = emptyResult();
    addUnitDamage(result, "enc1", PLAYER_A);
    let caps = deriveCapabilities(result, 60_000, null);
    expect(caps.hasMultiplePlayers).toBe(false);
    expect(caps.hasFocusTarget).toBe(false);

    addUnitDamage(result, "enc1", PLAYER_B);
    caps = deriveCapabilities(result, 60_000, null);
    expect(caps.hasMultiplePlayers).toBe(true);
    expect(caps.hasFocusTarget).toBe(true);
  });

  it("does not count pets as players, but flags hasPets", () => {
    const result = emptyResult();
    addUnitDamage(result, "enc1", PLAYER_A);
    addUnitDamage(result, "enc1", PET_A);
    const caps = deriveCapabilities(result, 60_000, null);
    expect(caps.hasMultiplePlayers).toBe(false);
    expect(caps.hasPets).toBe(true);
  });

  it("detects ability/target breakouts", () => {
    const result = emptyResult();
    result.ByAbility.set(PLAYER_A, new Map([["Fireball", createEmptyAbilityBreakout()]]));
    result.ByTarget.set(PLAYER_A, new Map([["0x0010000000000009", 1234]]));
    const caps = deriveCapabilities(result, 60_000, null);
    expect(caps.hasAbilityBreakout).toBe(true);
    expect(caps.hasTargetBreakout).toBe(true);
  });

  it("detects detailed hit-type stats", () => {
    const result = emptyResult();
    const breakout = createEmptyAbilityBreakout();
    breakout.CritStats = { count: 1, total: 500, min: 500, max: 500 };
    result.ByAbility.set(PLAYER_A, new Map([["Fireball", breakout]]));
    const caps = deriveCapabilities(result, 60_000, null);
    expect(caps.hasDetailedStats).toBe(true);
  });

  it("detects spell ranks only when spell IDs share a name", () => {
    const result = emptyResult();
    const mk = (spellName: string): SpellIdAbilityBreakout => ({
      ...createEmptyAbilityBreakout(),
      spellName,
    });
    result.ByAbilityBySpellId.set(
      PLAYER_A,
      new Map([
        [116, mk("Frostbolt")],
        [205, mk("Frostbolt")],
      ]),
    );
    expect(deriveCapabilities(result, 60_000, null).hasSpellRanks).toBe(true);

    const distinct = emptyResult();
    distinct.ByAbilityBySpellId.set(
      PLAYER_A,
      new Map([
        [116, mk("Frostbolt")],
        [133, mk("Fireball")],
      ]),
    );
    expect(deriveCapabilities(distinct, 60_000, null).hasSpellRanks).toBe(false);
  });
});
