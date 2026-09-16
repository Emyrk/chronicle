import { describe, expect, it } from "vitest";
import {
  compactAuraColors,
  compactAuraPercent,
  formatCompactAuraPercent,
} from "./compactAura";

describe("compact aura display", () => {
  it("clamps uptime percentage to the visible range", () => {
    expect(compactAuraPercent(5000, 10_000)).toBe(50);
    expect(compactAuraPercent(12_000, 10_000)).toBe(100);
    expect(compactAuraPercent(1000, 0)).toBe(0);
  });

  it("uses a continuous blue-to-green uptime scale", () => {
    expect(compactAuraColors(0).ring).toBe("hsl(210 72% 50%)");
    expect(compactAuraColors(50).ring).toBe("hsl(177.5 72% 50%)");
    expect(compactAuraColors(100).ring).toBe("hsl(145 72% 50%)");
    expect(compactAuraColors(-20)).toEqual(compactAuraColors(0));
    expect(compactAuraColors(120)).toEqual(compactAuraColors(100));
  });

  it("keeps a decimal for single-digit percentages", () => {
    expect(formatCompactAuraPercent(100)).toBe("100");
    expect(formatCompactAuraPercent(92.4)).toBe("92");
    expect(formatCompactAuraPercent(9.45)).toBe("9.4");
    expect(formatCompactAuraPercent(1)).toBe("1.0");
  });
});
