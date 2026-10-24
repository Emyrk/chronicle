import { describe, expect, it } from "vitest";
import type { DamageAbilityBreakout } from "../processors/abilityBreakout";
import { withExcludedHitDetails } from "./DamageDoneBreakout";

function breakout(overrides: Partial<DamageAbilityBreakout>): DamageAbilityBreakout {
  return {
    Total: 0,
    Count: 0,
    Crits: 0,
    Hits: 0,
    Misses: 0,
    ...overrides,
  };
}

describe("withExcludedHitDetails", () => {
  it("includes excluded combat outcomes without adding them to ranked damage", () => {
    const included = breakout({
      Total: 100,
      Absorbed: 10,
      Count: 2,
      Hits: 2,
      Crits: 1,
      Glancing: 1,
      HitStats: { count: 1, total: 40, min: 40, max: 40 },
      CritStats: { count: 1, total: 60, min: 60, max: 60 },
    });
    const excluded = breakout({
      Total: 250,
      Absorbed: 25,
      Count: 3,
      Hits: 2,
      Crits: 1,
      Misses: 1,
      Glancing: 2,
      HitStats: { count: 1, total: 100, min: 100, max: 100 },
      CritStats: { count: 1, total: 150, min: 150, max: 150 },
    });

    const combined = withExcludedHitDetails(included, excluded);

    expect(combined).toMatchObject({
      Total: 100,
      Absorbed: 10,
      Count: 5,
      Hits: 4,
      Crits: 2,
      Misses: 1,
      Glancing: 3,
      HitStats: { count: 2, total: 140, min: 40, max: 100 },
      CritStats: { count: 2, total: 210, min: 60, max: 150 },
    });
    expect(combined.Crits / combined.Count).toBe(0.4);
  });
});
