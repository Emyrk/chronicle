import { describe, expect, it } from "vitest"
import { hubSummaryURL } from "./hubSummaryAdapter"

describe("CDN-keyed hub summary", () => {
  it("uses one canonical CDN URL per landing realm selection", () => {
    expect(hubSummaryURL({ performance: "dps" })).toBe("/api/v1/rankings/ratings/hub-summary")
    expect(hubSummaryURL({ performance: "dps", realmIDs: ["b", "a", "a"] }))
      .toBe("/api/v1/rankings/ratings/hub-summary?realm_ids=a%2Cb")
  })

  it("preserves exact Turtle cohort zero and canonical realm order", () => {
    const url = hubSummaryURL({ instanceName: "Molten Core", encounterName: "Ragnaros",
      performance: "hps", cohort: { difficulty: "", maxPlayers: 0 }, realmIDs: ["b", "a", "a"] })
    const query = new URL(url, "http://localhost").searchParams
    expect(Object.fromEntries(query)).toMatchObject({ instance_name: "Molten Core", encounter_name: "Ragnaros",
      difficulty_name: "", max_players: "0", performance_metric: "hps", realm_ids: "a,b" })
    expect(query.has("limit")).toBe(false) // Caps are fixed by the server, not browser-controlled.
  })
})
