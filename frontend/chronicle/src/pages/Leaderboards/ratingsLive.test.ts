import { describe, expect, it, vi } from "vitest"
import { fetchLiveRating, ratingScopeURL } from "./ratingsLive"
import { v2Selection } from "./v2Selection"

describe("hidden V2 route selection", () => {
  it("defaults to overview and preserves selected live tab and instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null, realmIDs: [] })
    expect(v2Selection(new URLSearchParams("tab=ratings&instance=Molten+Core"))).toEqual({ tab: "ratings", instance: "Molten Core", realmIDs: [] })
    expect(v2Selection(new URLSearchParams("tab=fixture"))).toEqual({ tab: "overview", instance: null, realmIDs: [] })
  })
})

describe("published ratings adapter", () => {
  it("builds a renown board without a performance or class cohort", () => {
    const url = ratingScopeURL({ metric: "renown", window: "career", instanceName: "Molten Core" })!
    const q = new URL(url, "http://localhost").searchParams
    expect(q.has("group_id")).toBe(false)
    expect(q.has("realm_ids")).toBe(false)
    expect(q.get("instance_name")).toBe("Molten Core")
    expect(q.get("performance_metric")).toBe("none")
    expect(q.get("max_players")).toBe("0")
    expect(q.has("class")).toBe(false)
  })

  it("requires exact peak and mastery cohorts, never an all-classes board", () => {
    expect(ratingScopeURL({ metric: "peak", window: "period" })).toBeNull()
    const cohort = { difficulty: "Normal", maxPlayers: 40, playerClass: "Mage", spec: "Frost", subSpec: "", performance: "dps" as const }
    const q = new URL(ratingScopeURL({ metric: "peak", window: "period", cohort, realmIDs: ["realm-one", "realm-two"] })!, "http://localhost").searchParams
    expect(q.get("realm_ids")).toBe("realm-one,realm-two")
    expect(q.has("group_id")).toBe(false)
    expect(q.get("class")).toBe("Mage")
    expect(q.get("sub_spec")).toBe("")
    expect(q.get("max_players")).toBe("40")
    expect(ratingScopeURL({ metric: "mastery", window: "all_time", cohort })).toBeNull()
    expect(ratingScopeURL({ metric: "renown", window: "period", cohort })).toBeNull()
  })

  it("uses only the published response and rejects HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ scope: "global", entries: [] }) }).mockResolvedValueOnce({ ok: false, status: 503 })
    vi.stubGlobal("fetch", fetchMock)
    try {
      expect(await fetchLiveRating("/api/v1/rankings/ratings/scope-leaderboard?rating_metric=renown")).toEqual({ scope: "global", entries: [] })
      await expect(fetchLiveRating("/api/v1/rankings/ratings/scope-leaderboard")).rejects.toThrow("503")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
