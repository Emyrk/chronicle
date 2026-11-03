import { describe, expect, it } from "vitest"
import { hubParams, v2Selection } from "./v2Selection"

describe("hidden leaderboard v2 selection", () => {
  it("opens the live overview without selecting a mock instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null, encounter: null, realmIDs: [] })
  })

  it("preserves supported tabs and exact instance names in the URL", () => {
    expect(v2Selection(new URLSearchParams("tab=ratings&instance=Blackwing+Lair"))).toEqual({
      tab: "ratings", instance: "Blackwing Lair", encounter: null, realmIDs: [],
    })
  })

  it("reads optional realm selection without duplicates", () => {
    expect(v2Selection(new URLSearchParams("tab=ratings&realm_ids=realm-1%2Crealm-2%2Crealm-1"))).toEqual({
      tab: "ratings", instance: null, encounter: null, realmIDs: ["realm-1", "realm-2"],
    })
  })

  it("keeps tab and realm selection while entering or leaving an instance", () => {
    const selected = new URLSearchParams("tab=ratings&realm_ids=realm-1%2Crealm-2")
    const opened = hubParams(selected, "instance", "Molten Core")
    expect(v2Selection(opened)).toEqual({ tab: "ratings", instance: "Molten Core", encounter: null, realmIDs: ["realm-1", "realm-2"] })
    expect(v2Selection(hubParams(opened, "instance"))).toEqual({ tab: "ratings", instance: null, encounter: null, realmIDs: ["realm-1", "realm-2"] })
    expect(hubParams(opened, "realm_ids").has("realm_ids")).toBe(false)
  })

  it("keeps an exact encounter in the URL and clears it when the instance changes", () => {
    const params = new URLSearchParams("tab=performances&instance=Molten+Core&encounter=Ragnaros&realm_ids=realm-1")
    expect(v2Selection(params).encounter).toBe("Ragnaros")
    expect(v2Selection(hubParams(params, "encounter", "Lucifron")).encounter).toBe("Lucifron")
    expect(v2Selection(hubParams(params, "instance", "Blackwing Lair")).encounter).toBeNull()
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
    expect(v2Selection(new URLSearchParams("tab=unknown&instance=Molten+Core"))).toEqual({
      tab: "overview", instance: "Molten Core", encounter: null, realmIDs: [],
    })
  })
})
