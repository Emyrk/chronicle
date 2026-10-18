import { describe, expect, it } from "vitest";
import { hasRequiredPanelCapabilities, shouldLoadPublicRankingData } from "./panelAvailability";

describe("hasRequiredPanelCapabilities", () => {
  it("allows panels without requirements", () => {
    expect(hasRequiredPanelCapabilities({}, [])).toBe(true);
  });

  it("keeps ranking panels available but skips public ranking queries for unlisted instances", () => {
    expect(shouldLoadPublicRankingData(false)).toBe(true);
    expect(shouldLoadPublicRankingData(true)).toBe(false);
  });

  it("requires every declared capability", () => {
    const panel = { requiredCapabilities: ["raidgroup", "combatant_info"] };

    expect(hasRequiredPanelCapabilities(panel, ["raidgroup"])).toBe(false);
    expect(hasRequiredPanelCapabilities(panel, ["combatant_info", "raidgroup"])).toBe(true);
  });
});
