import { describe, expect, it } from "vitest";
import { capabilitiesFromSpeedrun, deriveCapabilities } from "./capabilities";
import {
  BLOCKED_FIXTURE_SPEEDRUN,
  QUALIFIED_FIXTURE_SPEEDRUN,
} from "./fixture";

describe("leaderboard explainer capabilities", () => {
  it("starts unavailable until the speedrun query resolves", () => {
    expect(deriveCapabilities({}, 0, null)).toEqual({
      hasSpeedrun: false,
      hasProof: false,
      hasEligibilityChecks: false,
      hasBlockers: false,
    });
  });

  it("derives blocker capabilities from the blocked fixture", () => {
    expect(capabilitiesFromSpeedrun(BLOCKED_FIXTURE_SPEEDRUN)).toEqual({
      hasSpeedrun: true,
      hasProof: true,
      hasEligibilityChecks: true,
      hasBlockers: true,
    });
  });

  it("treats the qualified fixture as blocker-free", () => {
    expect(capabilitiesFromSpeedrun(QUALIFIED_FIXTURE_SPEEDRUN)).toEqual({
      hasSpeedrun: true,
      hasProof: true,
      hasEligibilityChecks: true,
      hasBlockers: false,
    });
  });
});
