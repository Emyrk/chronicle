import { describe, expect, it } from "vitest";
import { hasRequiredPanelCapabilities } from "./panelAvailability";

describe("hasRequiredPanelCapabilities", () => {
  it("allows panels without requirements", () => {
    expect(hasRequiredPanelCapabilities({}, [])).toBe(true);
  });

  it("requires every declared capability", () => {
    const panel = { requiredCapabilities: ["raidgroup", "combatant_info"] };

    expect(hasRequiredPanelCapabilities(panel, ["raidgroup"])).toBe(false);
    expect(hasRequiredPanelCapabilities(panel, ["combatant_info", "raidgroup"])).toBe(true);
  });
});
