import { describe, expect, it } from "vitest"
import { hubInstanceParams, hubParams, hubPath, v2Selection } from "./v2Selection"

describe("hidden leaderboard v2 selection", () => {
  it("opens the live overview without selecting a mock instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null, encounters: [], realmIDs: [] })
  })

  it("reads landing tabs and exact instance names from path segments", () => {
    expect(v2Selection(new URLSearchParams(), { segment: "ratings" })).toEqual({
      tab: "ratings", instance: null, encounters: [], realmIDs: [],
    })
    expect(v2Selection(new URLSearchParams(), { instance: "Blackwing-Lair", tab: "ratings" })).toEqual({
      tab: "ratings", instance: "Blackwing Lair", encounters: [], realmIDs: [],
    })
    expect(v2Selection(new URLSearchParams(), { segment: "Blackwing-Lair" })).toEqual({
      tab: "overview", instance: "Blackwing Lair", encounters: [], realmIDs: [],
    })
  })

  it("reads optional realm selection without duplicates", () => {
    expect(v2Selection(new URLSearchParams("realm_ids=realm-1%2Crealm-2%2Crealm-1"), { segment: "ratings" })).toEqual({
      tab: "ratings", instance: null, encounters: [], realmIDs: ["realm-1", "realm-2"],
    })
  })

  it("keeps realm selection while entering or leaving an instance", () => {
    const selected = new URLSearchParams("realm_ids=realm-1%2Crealm-2")
    expect(hubPath("ratings", selected, "Molten Core")).toBe("/leaderboard-v2/Molten-Core/ratings?realm_ids=realm-1%2Crealm-2")
    expect(hubPath("ratings", selected)).toBe("/leaderboard-v2/ratings?realm_ids=realm-1%2Crealm-2")
    expect(hubParams(selected, "realm_ids").has("realm_ids")).toBe(false)
  })

  it("keeps chosen encounters in the query", () => {
    // The legacy single-boss link still opens that boss.
    const params = new URLSearchParams("encounter=Ragnaros&realm_ids=realm-1")
    expect(v2Selection(params, { instance: "Molten-Core", tab: "performances" }).encounters).toEqual(["Ragnaros"])
    const set = hubParams(params, "encounters", "Lucifron,Ragnaros")
    expect(v2Selection(set).encounters).toEqual(["Lucifron", "Ragnaros"])
    expect(set.has("encounter")).toBe(false)
  })

  it("drops instance-specific state when changing instances", () => {
    const params = new URLSearchParams("instance=Molten+Core&encounter=Ragnaros&difficulty=Normal&size=40&subject=guild&realm_ids=realm-1")
    const next = hubInstanceParams(params)
    expect(next.has("instance")).toBe(false)
    expect(next.has("encounter")).toBe(false)
    expect(next.has("difficulty")).toBe(false)
    expect(next.has("size")).toBe(false)
    expect(next.get("subject")).toBe("guild")
    expect(next.get("realm_ids")).toBe("realm-1")
  })

  it("falls back to the overview for unknown tabs", () => {
    expect(v2Selection(new URLSearchParams(), { instance: "Molten-Core", tab: "unknown" })).toEqual({
      tab: "overview", instance: "Molten Core", encounters: [], realmIDs: [],
    })
  })

  it("puts the instance and tab in the path and removes their legacy query parameters", () => {
    const params = new URLSearchParams("tab=ratings&instance=Molten+Core&encounters=Garr")
    expect(hubPath("performances", params, "Molten Core")).toBe("/leaderboard-v2/Molten-Core/performances?encounters=Garr")
    expect(hubPath("overview", params, "Molten Core")).toBe("/leaderboard-v2/Molten-Core?encounters=Garr")
    expect(hubPath("ratings", params)).toBe("/leaderboard-v2/ratings?encounters=Garr")
    expect(hubPath("overview", new URLSearchParams())).toBe("/leaderboard-v2")
  })
})
