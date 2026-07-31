import { describe, expect, it } from "vitest";
import { getBreakoutProgressLabel } from "./breakoutProgress";

describe("getBreakoutProgressLabel", () => {
  it("shows progress before the first breakout data is available", () => {
    expect(getBreakoutProgressLabel(false, true, false)).toBe("Loading...");
    expect(getBreakoutProgressLabel(false, false, true)).toBe("Processing...");
  });

  it("keeps populated breakouts visible during incremental processing", () => {
    expect(getBreakoutProgressLabel(true, false, true)).toBeNull();
    expect(getBreakoutProgressLabel(true, true, false)).toBeNull();
  });

  it("does not show progress after an empty result finishes", () => {
    expect(getBreakoutProgressLabel(false, false, false)).toBeNull();
  });
});
