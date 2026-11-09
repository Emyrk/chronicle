import { describe, expect, it, vi } from "vitest"
import { fetchLiveRating, ratingScopeURL } from "./ratingsLive"
import { v2Selection } from "./v2Selection"

describe("hidden V2 route selection", () => {
  it("defaults to overview and preserves selected live tab and instance", () => {
    expect(v2Selection(new URLSearchParams())).toEqual({ tab: "overview", instance: null, encounters: [], realmIDs: [] })
    expect(v2Selection(new URLSearchParams(), { instance: "Molten-Core", tab: "ratings" })).toEqual({ tab: "ratings", instance: "Molten Core", encounters: [], realmIDs: [] })
    expect(v2Selection(new URLSearchParams(), { segment: "fixture" })).toEqual({ tab: "overview", instance: "fixture", encounters: [], realmIDs: [] })
  })
})

describe("published ratings adapter", () => {
  it("builds a renown board without a performance or class cohort", () => {
    const url = ratingScopeURL({ metric: "renown", window: "career", instanceName: "Molten Core" })!
    const q = new URL(url, "http://localhost").searchParams
    expect(q.has("group_id")).toBe(false)
    expect(q.has("realm_ids")).toBe(false)
    expect(q.get("instance_name")).toBe("Molten Core")
    expect(url).toContain("/ratings/scope-leaderboard?")
    expect(ratingScopeURL({ metric: "renown", window: "period" })).toBeNull()
    expect(q.get("performance_metric")).toBe("none")
    expect(q.get("max_players")).toBe("0")
    expect(q.has("class")).toBe(false)
  })

  it("requires exact peak and mastery cohorts, never an all-classes board", () => {
    const cohort = { difficulty: "Normal", maxPlayers: 40, playerClass: "Mage", spec: "Frost", subSpec: "", performance: "dps" as const }
    expect(ratingScopeURL({ metric: "peak", window: "period", cohort })).toBeNull()
    expect(ratingScopeURL({ metric: "peak", window: "period", instanceName: "Molten Core" })).toBeNull()
    const q = new URL(ratingScopeURL({ metric: "peak", window: "period", instanceName: "Molten Core", cohort, realmIDs: ["realm-one", "realm-two"] })!, "http://localhost").searchParams
    expect(q.get("realm_ids")).toBe("realm-one,realm-two")
    expect(q.has("group_id")).toBe(false)
    expect(q.get("class")).toBe("Mage")
    expect(q.get("sub_spec")).toBe("")
    expect(q.get("max_players")).toBe("40")
    expect(ratingScopeURL({ metric: "mastery", window: "all_time", instanceName: "Molten Core", cohort })).not.toBeNull()
    expect(ratingScopeURL({ metric: "renown", window: "period", instanceName: "Molten Core", cohort })).toBeNull()
  })

  it("uses only the published response and rejects HTTP errors", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ scope: "raid", entries: [], next_cursor: "next-page" }) }).mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: async () => ({ scope: "global", entries: [] }) })
    vi.stubGlobal("fetch", fetchMock)
    try {
      const url = "/api/v1/rankings/ratings/scope-leaderboard?instance_name=Molten+Core"
      expect(await fetchLiveRating(url, "cursor/==")).toEqual({ scope: "raid", entries: [], next_cursor: "next-page" })
      expect(fetchMock).toHaveBeenCalledWith(`${url}&cursor=cursor%2F%3D%3D`)
      await expect(fetchLiveRating(url)).rejects.toThrow("503")
      await expect(fetchLiveRating(url)).rejects.toThrow("not a raid board")
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
