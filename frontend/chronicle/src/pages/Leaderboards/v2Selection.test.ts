import { describe, expect, it } from "vitest"
import { hubParams, hubPath, v2Selection } from "./v2Selection"

describe("hidden leaderboard v2 selection", () => {
  it("opens the live overview without selecting a mock instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null, encounters: [], realmIDs: [] })
  })

  it("preserves supported tabs and exact instance names in the URL", () => {
    expect(v2Selection(new URLSearchParams("instance=Blackwing+Lair"), "ratings")).toEqual({
      tab: "ratings", instance: "Blackwing Lair", encounters: [], realmIDs: [],
    })
  })

  it("reads optional realm selection without duplicates", () => {
    expect(v2Selection(new URLSearchParams("realm_ids=realm-1%2Crealm-2%2Crealm-1"), "ratings")).toEqual({
      tab: "ratings", instance: null, encounters: [], realmIDs: ["realm-1", "realm-2"],
    })
  })

  it("keeps tab and realm selection while entering or leaving an instance", () => {
    const selected = new URLSearchParams("realm_ids=realm-1%2Crealm-2")
    const opened = hubParams(selected, "instance", "Molten Core")
    expect(v2Selection(opened, "ratings")).toEqual({ tab: "ratings", instance: "Molten Core", encounters: [], realmIDs: ["realm-1", "realm-2"] })
    expect(v2Selection(hubParams(opened, "instance"), "ratings")).toEqual({ tab: "ratings", instance: null, encounters: [], realmIDs: ["realm-1", "realm-2"] })
    expect(hubParams(opened, "realm_ids").has("realm_ids")).toBe(false)
  })

  it("keeps chosen encounters in the URL and clears them when the instance changes", () => {
    // The legacy single-boss link still opens that boss.
    const params = new URLSearchParams("tab=performances&instance=Molten+Core&encounter=Ragnaros&realm_ids=realm-1")
    expect(v2Selection(params).encounters).toEqual(["Ragnaros"])
    const set = hubParams(params, "encounters", "Lucifron,Ragnaros")
    expect(v2Selection(set).encounters).toEqual(["Lucifron", "Ragnaros"])
    expect(set.has("encounter")).toBe(false)
    expect(v2Selection(hubParams(set, "instance", "Blackwing Lair")).encounters).toEqual([])
    expect(v2Selection(hubParams(params, "instance", "Blackwing Lair")).realmIDs).toEqual(["realm-1"])
  })

  it("drops the exact raid cohort with encounter when changing instances", () => {
    const params = new URLSearchParams("instance=Molten+Core&encounter=Ragnaros&difficulty=Normal&size=40&subject=guild&realm_ids=realm-1")
    const next = hubParams(params, "instance", "Blackwing Lair")
    expect(next.has("encounter")).toBe(false)
    expect(next.has("difficulty")).toBe(false)
    expect(next.has("size")).toBe(false)
    expect(next.get("subject")).toBe("guild")
    expect(next.get("realm_ids")).toBe("realm-1")
  })

  it("falls back to the overview for unknown tabs", () => {
    expect(v2Selection(new URLSearchParams("instance=Molten+Core"), "unknown")).toEqual({
      tab: "overview", instance: "Molten Core", encounters: [], realmIDs: [],
    })
  })

  it("puts each tab in the path and keeps the query", () => {
    const params = new URLSearchParams("tab=ratings&instance=Molten+Core&encounters=Garr")
    expect(hubPath("performances", params)).toBe("/leaderboard-v2/performances?instance=Molten+Core&encounters=Garr")
    expect(hubPath("overview", params)).toBe("/leaderboard-v2?instance=Molten+Core&encounters=Garr")
    expect(hubPath("overview", new URLSearchParams())).toBe("/leaderboard-v2")
  })
})
