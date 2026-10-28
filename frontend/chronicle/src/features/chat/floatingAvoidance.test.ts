import { describe, expect, it } from "vitest";
import { bottomRightAvoidanceOffset, renderedTranslateY } from "./floatingAvoidance";

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

describe("renderedTranslateY", () => {
  it("reads the translation from computed transforms", () => {
    expect(renderedTranslateY("none")).toBe(0);
    expect(renderedTranslateY("matrix(1, 0, 0, 1, 0, -37.5)")).toBe(-37.5);
    expect(renderedTranslateY("matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -12, 0, 1)")).toBe(-12);
    expect(renderedTranslateY("rotate(1deg)")).toBe(0);
  });
});
