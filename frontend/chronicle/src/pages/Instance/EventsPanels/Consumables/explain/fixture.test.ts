import { describe, expect, it } from "vitest";
import { FIXTURE_PLAYERS, getFixtureResult, getUnresolvedFixtureResult } from "./fixture";

describe("consumables explainer fixture", () => {
  it("contains a raid-sized mix of players, encounters, and items", () => {
    const result = getFixtureResult();
    const uses = [...result.uses.values()];

    expect(uses).toHaveLength(16);
    expect(new Set(uses.map((use) => use.player)).size).toBe(Object.keys(FIXTURE_PLAYERS).length);
    expect(new Set(uses.map((use) => use.encounterID)).size).toBe(3);
    expect(uses.some((use) => use.activeAtPullOnly)).toBe(true);
  });

  it("keeps evidence identifiers unique", () => {
    const evidenceIds = [...getFixtureResult().uses.values()].flatMap((use) =>
      use.observations.map((observation) => observation.evidenceId),
    );
    expect(new Set(evidenceIds).size).toBe(evidenceIds.length);
  });

  it("provides both candidate and unknown unresolved effects", () => {
    const uses = [...getUnresolvedFixtureResult().uses.values()];
    expect(uses.some((use) => use.itemId === null && use.candidateItemIds.length > 1)).toBe(true);
    expect(uses.some((use) => use.itemId === null && use.candidateItemIds.length === 0)).toBe(true);
  });
});
