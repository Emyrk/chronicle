import { describe, expect, it } from "vitest";
import { shouldShowInitialPanelState } from "./genericPanelState";

describe("shouldShowInitialPanelState", () => {
  it("blocks before the first empty aggregation completes", () => {
    expect(shouldShowInitialPanelState(true, 0, null)).toBe(true);
  });

  it("keeps a completed empty panel visible during replay updates", () => {
    expect(shouldShowInitialPanelState(true, 0, 0)).toBe(false);
    expect(shouldShowInitialPanelState(true, 0, 12)).toBe(false);
  });

  it("keeps panels with processed events visible", () => {
    expect(shouldShowInitialPanelState(true, 1, null)).toBe(false);
  });
});
