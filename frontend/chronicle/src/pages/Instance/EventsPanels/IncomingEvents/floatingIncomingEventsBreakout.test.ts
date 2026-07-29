import { describe, expect, it } from "vitest";
import {
  clampBreakoutBodyHeight,
  MIN_BREAKOUT_BODY_HEIGHT,
} from "./floatingIncomingEventsBreakout";

describe("clampBreakoutBodyHeight", () => {
  it("allows the event body to grow within the viewport", () => {
    expect(clampBreakoutBodyHeight(420, 900)).toBe(420);
  });

  it("enforces the minimum event body height", () => {
    expect(clampBreakoutBodyHeight(40, 900)).toBe(MIN_BREAKOUT_BODY_HEIGHT);
  });

  it("leaves room for the breakout header and relative-health content", () => {
    expect(clampBreakoutBodyHeight(900, 700)).toBe(480);
  });
});
