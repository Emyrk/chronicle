import { describe, expect, it } from "vitest";
import { STATUS_BREAKOUT_DEFAULT_WINDOW } from "./statusBreakoutWindow";

describe("Status breakout window", () => {
  it("defaults to All", () => {
    expect(STATUS_BREAKOUT_DEFAULT_WINDOW).toBe("all");
  });
});
