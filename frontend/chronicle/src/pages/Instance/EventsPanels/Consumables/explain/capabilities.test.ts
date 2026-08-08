import { describe, expect, it } from "vitest";
import { deriveCapabilities } from "./capabilities";
import { getFixtureInstance, getFixtureResult, getUnresolvedFixtureResult } from "./fixture";

describe("deriveCapabilities", () => {
  it("returns no data capabilities for an empty result", () => {
    expect(deriveCapabilities(null, 0, null)).toEqual({
      hasUses: false,
      hasMultiplePlayers: false,
      hasMultipleItems: false,
      hasMultipleEncounters: false,
      hasAmbiguousUses: false,
    });
  });

  it("detects the fixture features used by the lessons", () => {
    expect(deriveCapabilities(getFixtureResult(), 315_000, getFixtureInstance())).toEqual({
      hasUses: true,
      hasMultiplePlayers: true,
      hasMultipleItems: true,
      hasMultipleEncounters: true,
      hasAmbiguousUses: true,
    });
  });

  it("keeps unresolved fixture data teachable", () => {
    const caps = deriveCapabilities(getUnresolvedFixtureResult(), 315_000, getFixtureInstance());
    expect(caps.hasUses).toBe(true);
    expect(caps.hasAmbiguousUses).toBe(true);
  });
});
