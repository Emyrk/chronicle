import { describe, expect, it } from "vitest"
import { landingHighlightsURL, landingRealmError } from "./landingHighlights"

describe("landing snapshot selection", () => {
  it("requests all realms or precisely one realm without class filters", () => {
    expect(landingHighlightsURL()).toBe("/api/v1/leaderboards-v2/highlights")
    expect(landingHighlightsURL("realm-1")).toBe("/api/v1/leaderboards-v2/highlights?realm=realm-1")
  })
  it("rejects multi-realm and unknown IDs rather than broadening selection", () => {
    const realms = [{ id: "realm-1" }]
    expect(landingRealmError([], realms)).toBeUndefined()
    expect(landingRealmError(["realm-1"], realms)).toBeUndefined()
    expect(landingRealmError(["realm-1", "realm-2"], realms)).toBe("Choose All realms or one realm to view highlights")
    expect(landingRealmError(["unknown"], realms)).toContain("Unknown realm")
  })
})
