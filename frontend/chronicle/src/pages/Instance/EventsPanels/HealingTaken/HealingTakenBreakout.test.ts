import { describe, it, expect } from "vitest";
import { getAllTargetSpellIds, getAbilitiesBySpellIdForUnit } from "./HealingTakenBreakout";
import { PERIODIC_SPELL_ID_OFFSET } from "../processors/abilityBreakout";
import { createEmptySpellIdAbilityBreakout } from "../processors/abilityBreakout";
import type { UnifiedHealingResult } from "../processors";
import { createGuidCache } from "../processors/guidCache";

/** Build a minimal UnifiedHealingResult with only the TargetByAbilityBySpellId family populated. */
function createStubResult(
  overrides?: Partial<UnifiedHealingResult>,
): UnifiedHealingResult {
  return {
    EncounterHealingByHealer: new Map(),
    HealerByAbility: new Map(),
    HealerByAbilityOverheal: new Map(),
    HealerByAbilityTotal: new Map(),
    HealerByTarget: new Map(),
    HealerByTargetOverheal: new Map(),
    HealerByTargetTotal: new Map(),
    HealerByAbilityBySpellId: new Map(),
    HealerByAbilityOverhealBySpellId: new Map(),
    HealerByAbilityTotalBySpellId: new Map(),
    EncounterHealingByTarget: new Map(),
    TargetByAbility: new Map(),
    TargetByAbilityOverheal: new Map(),
    TargetByAbilityTotal: new Map(),
    TargetByAbilityBySpellId: new Map(),
    TargetByAbilityOverhealBySpellId: new Map(),
    TargetByAbilityTotalBySpellId: new Map(),
    TargetBySource: new Map(),
    TargetBySourceOverheal: new Map(),
    TargetBySourceTotal: new Map(),
    HealerByAbilityAbsorbed: new Map(),
    TargetByAbilityAbsorbed: new Map(),
    HealerByAbilityAbsorbedBySpellId: new Map(),
    TargetByAbilityAbsorbedBySpellId: new Map(),
    HealthDeficits: new Map(),
    LastEncounterID: null,
    GuidCache: createGuidCache(),
    ServerOverheal: true,
    ...overrides,
  };
}

const DIRECT_SPELL_ID = 500;
const HOT_COMPOSITE_ID = DIRECT_SPELL_ID + PERIODIC_SPELL_ID_OFFSET;
const TARGET = "0x0000000000005678";

describe("getAllTargetSpellIds", () => {
  it("normalizes periodic composite keys to real spell IDs", () => {
    const targetMap = new Map([
      [DIRECT_SPELL_ID, createEmptySpellIdAbilityBreakout("Rejuvenation")],
      [HOT_COMPOSITE_ID, createEmptySpellIdAbilityBreakout("Rejuvenation (HoT)")],
    ]);

    const result = createStubResult({
      TargetByAbilityBySpellId: new Map([[TARGET, targetMap]]),
    });

    const ids = getAllTargetSpellIds(result);

    expect(ids).toContain(DIRECT_SPELL_ID);
    expect(ids).not.toContain(HOT_COMPOSITE_ID);
    // Both resolve to the same real ID, so the set should have exactly one entry
    expect(ids).toHaveLength(1);
  });

  it("returns empty array for undefined result", () => {
    expect(getAllTargetSpellIds(undefined)).toEqual([]);
  });

  it("deduplicates across effective, overheal, and total maps", () => {
    const mkMap = () =>
      new Map([[HOT_COMPOSITE_ID, createEmptySpellIdAbilityBreakout("Renew (HoT)")]]);

    const result = createStubResult({
      TargetByAbilityBySpellId: new Map([[TARGET, mkMap()]]),
      TargetByAbilityOverhealBySpellId: new Map([[TARGET, mkMap()]]),
      TargetByAbilityTotalBySpellId: new Map([[TARGET, mkMap()]]),
    });

    const ids = getAllTargetSpellIds(result);
    expect(ids).toEqual([DIRECT_SPELL_ID]);
  });
});

describe("getAbilitiesBySpellIdForUnit", () => {
  function buildResult(): UnifiedHealingResult {
    const directBreakout = {
      ...createEmptySpellIdAbilityBreakout("Rejuvenation"),
      Total: 300,
      Count: 3,
      Hits: 3,
      Crits: 0,
      Misses: 0,
    };
    const hotBreakout = {
      ...createEmptySpellIdAbilityBreakout("Rejuvenation (HoT)"),
      Total: 500,
      Count: 10,
      Hits: 10,
      Crits: 0,
      Misses: 0,
    };

    const targetMap = new Map([
      [DIRECT_SPELL_ID, directBreakout],
      [HOT_COMPOSITE_ID, hotBreakout],
    ]);

    return createStubResult({
      TargetByAbilityBySpellId: new Map([[TARGET, targetMap]]),
      TargetByAbilityOverhealBySpellId: new Map([[TARGET, new Map([
        [HOT_COMPOSITE_ID, {
          ...createEmptySpellIdAbilityBreakout("Rejuvenation (HoT)"),
          Total: 50,
          Count: 2,
          Hits: 2,
          Crits: 0,
          Misses: 0,
        }],
      ])]]),
      TargetByAbilityTotalBySpellId: new Map([[TARGET, new Map([
        [DIRECT_SPELL_ID, { ...directBreakout }],
        [HOT_COMPOSITE_ID, { ...hotBreakout }],
      ])]]),
      TargetByAbilityAbsorbedBySpellId: new Map([[TARGET, new Map([
        [HOT_COMPOSITE_ID, 20],
      ])]]),
    });
  }

  it("returns real spell IDs for both direct and HoT entries in effective mode", () => {
    const abilities = getAbilitiesBySpellIdForUnit(buildResult(), TARGET, "effective");

    expect(abilities.length).toBeGreaterThanOrEqual(2);

    const direct = abilities.find((a) => a.name === "Rejuvenation");
    const hot = abilities.find((a) => a.name === "Rejuvenation (HoT)");

    expect(direct).toBeDefined();
    expect(hot).toBeDefined();
    expect(direct!.spellId).toBe(DIRECT_SPELL_ID);
    expect(hot!.spellId).toBe(DIRECT_SPELL_ID); // same real ID, different name
  });

  it("preserves HoT name suffix despite normalized spell ID", () => {
    const abilities = getAbilitiesBySpellIdForUnit(buildResult(), TARGET, "effective");
    const hot = abilities.find((a) => a.name === "Rejuvenation (HoT)");
    expect(hot).toBeDefined();
    expect(hot!.name).toBe("Rejuvenation (HoT)");
    expect(hot!.spellId).toBe(DIRECT_SPELL_ID);
  });

  it("correlates overheal and absorbed using composite keys in effective mode", () => {
    const abilities = getAbilitiesBySpellIdForUnit(buildResult(), TARGET, "effective");
    const hot = abilities.find((a) => a.name === "Rejuvenation (HoT)");
    expect(hot).toBeDefined();
    expect(hot!.overheal).toBe(50);
    expect(hot!.absorbed).toBe(20);
  });

  it("returns real spell IDs in overheal mode", () => {
    const abilities = getAbilitiesBySpellIdForUnit(buildResult(), TARGET, "overheal");
    expect(abilities).toHaveLength(1);
    expect(abilities[0].name).toBe("Rejuvenation (HoT)");
    expect(abilities[0].spellId).toBe(DIRECT_SPELL_ID);
  });

  it("returns real spell IDs in total mode", () => {
    const abilities = getAbilitiesBySpellIdForUnit(buildResult(), TARGET, "total");
    const hot = abilities.find((a) => a.name === "Rejuvenation (HoT)");
    expect(hot).toBeDefined();
    expect(hot!.spellId).toBe(DIRECT_SPELL_ID);
    // absorbed should still correlate via composite key
    expect(hot!.absorbed).toBe(20);
  });

  it("returns empty array for missing unit", () => {
    expect(getAbilitiesBySpellIdForUnit(buildResult(), "0xNONEXISTENT", "effective")).toEqual([]);
  });
});
