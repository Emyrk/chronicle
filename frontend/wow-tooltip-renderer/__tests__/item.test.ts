import { describe, it, expect } from "vitest";
import {
  formatItemStat,
  calculateDPS,
  spellTriggerText,
} from "../src/item/formatters.js";
import { getQualityColor, QUALITY_COLORS } from "../src/shared/quality.js";

describe("formatItemStat", () => {
  it("formats white base attributes", () => {
    expect(formatItemStat(4, 20)).toEqual({ text: "+20 Strength", green: false });
    expect(formatItemStat(7, 15)).toEqual({ text: "+15 Stamina", green: false });
  });

  it("formats green combat ratings as Equip: lines", () => {
    expect(formatItemStat(32, 14)).toEqual({
      text: "Equip: Improves critical strike rating by 14.",
      green: true,
    });
    expect(formatItemStat(45, 63)).toEqual({
      text: "Equip: Increases spell power by 63.",
      green: true,
    });
  });

  it("falls back for unknown stat types", () => {
    expect(formatItemStat(999, 5)).toEqual({
      text: "+5 Unknown Stat 999",
      green: false,
    });
  });
});

describe("calculateDPS", () => {
  it("computes (min+max)/2 / (delay/1000)", () => {
    // (100 + 200)/2 = 150 over 2.0s -> 75 DPS
    expect(calculateDPS({ min: 100, max: 200 }, 2000)).toBeCloseTo(75);
  });
  it("returns null for missing/invalid inputs", () => {
    expect(calculateDPS(undefined, 2000)).toBeNull();
    expect(calculateDPS({ min: 10, max: 20 }, 0)).toBeNull();
    expect(calculateDPS({ min: 10, max: 20 }, undefined)).toBeNull();
  });
});

describe("spellTriggerText", () => {
  it("maps trigger codes to prefixes", () => {
    expect(spellTriggerText(0)).toBe("Use:");
    expect(spellTriggerText(1)).toBe("Equip:");
    expect(spellTriggerText(2)).toBe("Chance on hit:");
    expect(spellTriggerText(99)).toBe("Use:"); // fallback
  });
});

describe("quality colors (hex)", () => {
  it("returns hex per quality level", () => {
    expect(getQualityColor(4)).toBe("#a335ee"); // epic
    expect(QUALITY_COLORS[5]).toBe("#ff8000"); // legendary
  });
  it("defaults unknown quality to common white", () => {
    expect(getQualityColor(42)).toBe("#ffffff");
  });
});
