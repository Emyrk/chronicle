import { describe, expect, it } from "vitest";
import {
  clampPluginBreakoutPosition,
  clampPluginBreakoutSize,
  MIN_PLUGIN_BREAKOUT_HEIGHT,
  MIN_PLUGIN_BREAKOUT_WIDTH,
  normalizePluginBreakoutOptions,
  normalizePluginBreakoutTitle,
} from "./pluginBreakoutLogic";

const viewport = { width: 1_000, height: 800 };

describe("plugin breakout bounds", () => {
  it("clamps dimensions to the viewport and minimum size", () => {
    expect(clampPluginBreakoutSize({ width: 10, height: 20 }, viewport)).toEqual({
      width: MIN_PLUGIN_BREAKOUT_WIDTH,
      height: MIN_PLUGIN_BREAKOUT_HEIGHT,
    });
    expect(clampPluginBreakoutSize({ width: 5_000, height: 5_000 }, viewport)).toEqual({
      width: 984,
      height: 784,
    });
  });

  it("keeps a draggable portion of the header inside the viewport", () => {
    expect(clampPluginBreakoutPosition(
      { x: 5_000, y: 5_000 },
      { width: 420, height: 320 },
      viewport,
    )).toEqual({ x: 880, y: 760 });
  });

  it("cascades default positions for multiple breakouts", () => {
    expect(normalizePluginBreakoutOptions({ title: "Details" }, viewport, 2)).toMatchObject({
      title: "Details",
      initialPosition: { x: 56, y: 56 },
      initialSize: { width: 420, height: 320 },
    });
  });

  it("rejects empty and oversized titles", () => {
    expect(() => normalizePluginBreakoutTitle("   ")).toThrow("title is required");
    expect(() => normalizePluginBreakoutTitle("x".repeat(101))).toThrow("exceeds 100 characters");
  });
});
