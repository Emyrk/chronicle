import { describe, expect, it } from "vitest";
import { clampFloatingPanelPosition } from "./floatingPanelPosition";

describe("clampFloatingPanelPosition", () => {
  const panel = { width: 480, height: 320 };
  const viewport = { width: 1280, height: 720 };

  it("keeps positions that are already inside the viewport", () => {
    expect(clampFloatingPanelPosition({ x: 100, y: 80 }, panel, viewport)).toEqual({ x: 100, y: 80 });
  });

  it("collides with every viewport edge", () => {
    expect(clampFloatingPanelPosition({ x: -50, y: -25 }, panel, viewport)).toEqual({ x: 0, y: 0 });
    expect(clampFloatingPanelPosition({ x: 1000, y: 600 }, panel, viewport)).toEqual({ x: 800, y: 400 });
  });

  it("anchors oversized panels at the top-left", () => {
    expect(clampFloatingPanelPosition(
      { x: 40, y: 30 },
      { width: 1400, height: 900 },
      viewport,
    )).toEqual({ x: 0, y: 0 });
  });
});
