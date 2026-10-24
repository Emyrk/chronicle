import { describe, expect, it } from "vitest";
import {
  hasRequiredPanelCapabilities,
  hasRequiredPanelFlavors,
  shouldLoadPublicRankingData,
} from "./panelAvailability";

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

describe("hasRequiredPanelFlavors", () => {
  it("requires every declared flavor", () => {
    const panel = { requiredFlavors: ["wrath"] };

    expect(hasRequiredPanelFlavors(panel, [])).toBe(false);
    expect(hasRequiredPanelFlavors(panel, ["vanilla"])).toBe(false);
    expect(hasRequiredPanelFlavors(panel, ["wrath", "azerothcore"])).toBe(true);
  });
});
