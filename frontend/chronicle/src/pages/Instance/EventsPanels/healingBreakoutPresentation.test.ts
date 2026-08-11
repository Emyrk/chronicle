import { describe, expect, it } from "vitest";
import { shouldPlaceEffectiveHealingBeforeOverheal } from "./healingBreakoutPresentation";

describe("shouldPlaceEffectiveHealingBeforeOverheal", () => {
  it("prioritizes effective healing in the mobile modal", () => {
    expect(shouldPlaceEffectiveHealingBeforeOverheal(true, true, true)).toBe(true);
  });

  it("keeps the original order in a desktop floating breakout", () => {
    expect(shouldPlaceEffectiveHealingBeforeOverheal(true, true, false)).toBe(false);
  });

  it("keeps the original order in a hover breakout", () => {
    expect(shouldPlaceEffectiveHealingBeforeOverheal(true, false, true)).toBe(false);
  });

  it("does not reorder other healing modes", () => {
    expect(shouldPlaceEffectiveHealingBeforeOverheal(false, true, true)).toBe(false);
  });
});
