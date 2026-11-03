import { describe, expect, it } from "vitest"
import { hubSummaryURL } from "./hubSummaryAdapter"

describe("CDN-keyed hub summary", () => {
  it("uses one canonical CDN URL per landing realm selection", () => {
    expect(hubSummaryURL({ performance: "dps" })).toBe("/api/v1/rankings/ratings/hub-summary")
    expect(hubSummaryURL({ performance: "dps", realmIDs: ["b", "a", "a"] }))
      .toBe("/api/v1/rankings/ratings/hub-summary?realm_ids=a%2Cb")
  })

  it("fetches only the active landing tab's board", () => {
    expect(hubSummaryURL({ performance: "dps", tab: "overview" })).toBe("/api/v1/rankings/ratings/hub-summary")
    expect(hubSummaryURL({ performance: "dps", tab: "statistics" })).toBe("/api/v1/rankings/ratings/hub-summary?tab=statistics")
  })

  it("preserves exact Turtle cohort zero and canonical realm order", () => {
    const url = hubSummaryURL({ instanceName: "Molten Core", encounters: ["Ragnaros"],
      performance: "hps", cohort: { difficulty: "", maxPlayers: 0 }, realmIDs: ["b", "a", "a"] })
    const query = new URL(url, "http://localhost").searchParams
    expect(Object.fromEntries(query)).toMatchObject({ instance_name: "Molten Core", encounter_name: "Ragnaros",
      difficulty_name: "", max_players: "0", performance_metric: "hps", realm_ids: "a,b" })
    expect(query.has("limit")).toBe(false) // Caps are fixed by the server, not browser-controlled.
    const set = new URL(hubSummaryURL({ instanceName: "Molten Core", encounters: ["Lucifron", "Ragnaros"], performance: "dps" }), "http://localhost").searchParams
    expect(set.get("encounter_names")).toBe("Lucifron,Ragnaros")
    expect(set.has("encounter_name")).toBe(false)
  })
})
