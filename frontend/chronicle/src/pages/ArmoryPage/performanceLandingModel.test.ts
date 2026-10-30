import { describe, expect, it } from "vitest";
import { excludeFavoriteResults, matchesLandingSearch } from "./performanceLandingModel";

describe("performance landing search", () => {
  it("shows all favorites before a query and filters them case-insensitively", () => {
    expect(matchesLandingSearch("", "Velyndra", "Eversong Wilds")).toBe(true);
    expect(matchesLandingSearch("VEL", "Velyndra", "Eversong Wilds")).toBe(true);
    expect(matchesLandingSearch("wilds", "Velyndra", "Eversong Wilds")).toBe(true);
    expect(matchesLandingSearch("morth", "Velyndra", "Eversong Wilds")).toBe(false);
  });

  it("removes favorites from regular search results so they only appear first", () => {
    const favorites = [{ id: "player-1", realm_id: "realm-1" }];
    const results = [
      { id: "player-1", realm_id: "realm-1", name: "Favorite" },
      { id: "player-2", realm_id: "realm-1", name: "Result" },
      { id: "player-1", realm_id: "realm-2", name: "Same ID, other realm" },
    ];

    expect(excludeFavoriteResults(results, favorites)).toEqual(results.slice(1));
  });
});
