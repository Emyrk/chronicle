import { describe, expect, it } from "vitest";
import { bottomRightAvoidanceOffset } from "./floatingAvoidance";

const rect = (left: number, top: number, width: number, height: number) => ({
  top,
  right: left + width,
  bottom: top + height,
  left,
  width,
  height,
});

describe("bottomRightAvoidanceOffset", () => {
  it("moves the launcher above an overlapping bottom-right control", () => {
    expect(bottomRightAvoidanceOffset(
      rect(880, 720, 120, 40),
      [rect(920, 700, 64, 80)],
    )).toBe(68);
  });

  it("clears the topmost of multiple bottom-right controls", () => {
    expect(bottomRightAvoidanceOffset(
      rect(880, 720, 120, 40),
      [rect(920, 700, 64, 80), rect(860, 560, 140, 120)],
    )).toBe(208);
  });

  it("ignores controls outside the launcher's horizontal path", () => {
    expect(bottomRightAvoidanceOffset(
      rect(880, 720, 120, 40),
      [rect(700, 600, 100, 180)],
    )).toBe(0);
  });
});
