import { describe, expect, it } from "vitest";
import { createDeathLogPanel } from "./DeathLog";
import { extractDeathWindow, updateDeathWindow } from "./deathBreakoutWindow";

describe("Death Log filters", () => {
  it("defaults to hiding zero-effective heals with an editable filter", () => {
    const panel = createDeathLogPanel();

    expect(panel.supportsFiltering).toBe(true);
    expect(panel.defaultFilters).toContainEqual({
      type: "event_value",
      value: "!=:0",
      applyTo: ["heal"],
    });
    expect(panel.fixedFilters).toBeUndefined();
  });
});

describe("Death Log breakout window", () => {
  it("defaults missing and invalid values to 30 seconds", () => {
    expect(extractDeathWindow(null)).toBe(30);
    expect(extractDeathWindow("m:players,w:nope")).toBe(30);
  });

  it("clamps numeric values and parses All", () => {
    expect(extractDeathWindow("w:2")).toBe(5);
    expect(extractDeathWindow("w:200")).toBe(120);
    expect(extractDeathWindow("w:all")).toBe("all");
  });

  it("updates the window while preserving unrelated options", () => {
    expect(updateDeathWindow("m:enemies,foo", "all")).toBe("m:enemies,foo,w:all");
    expect(updateDeathWindow("m:players,w:30", 45)).toBe("m:players,w:45");
  });
});
