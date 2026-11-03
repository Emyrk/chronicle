import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchLiveRatingPage, liveRatingURL, StaleRatingCursorError, type LiveRatingBoardRequest } from "./liveRatingAdapter"

const cohort = { difficulty: "Heroic", maxPlayers: 40, playerClass: "Mage", spec: "Frost", subSpec: "Arcane", performance: "dps" as const }
const player: LiveRatingBoardRequest = { instanceName: "Molten Core", subject: "player", metric: "ranked_mastery", window: "period", cohort }

function query(request: LiveRatingBoardRequest) {
  const url = liveRatingURL(request)!
  return { path: new URL(url, "http://localhost").pathname, params: new URL(url, "http://localhost").searchParams }
}

afterEach(() => vi.unstubAllGlobals())

describe("tenant live rating URLs", () => {
  it("requires exact player raid and boss cohorts, without group_id", () => {
    const { path, params } = query(player)
    expect(path).toBe("/api/v1/rankings/ratings/scope-leaderboard")
    expect(params.get("class")).toBe("Mage")
    expect(params.get("spec")).toBe("Frost")
    expect(params.get("sub_spec")).toBe("Arcane")
    expect(params.get("performance_metric")).toBe("dps")
    expect(params.get("difficulty_name")).toBe("Heroic")
    expect(params.get("max_players")).toBe("40")
    expect(params.get("window_kind")).toBe("period")
    expect(params.has("group_id")).toBe(false)
    const boss = query({ ...player, encounterName: "Ragnaros", window: "all_time" })
    expect(boss.path).toContain("/boss-leaderboard")
    expect(boss.params.get("encounter_name")).toBe("Ragnaros")
    expect(boss.params.get("window_kind")).toBe("all_time")
    expect(liveRatingURL({ ...player, cohort: undefined })).toBeNull()
    expect(liveRatingURL({ ...player, cohort: { ...cohort, subSpec: undefined } })).toBeNull()
    expect(liveRatingURL({ ...player, instanceName: "" })).toBeNull()
    expect(liveRatingURL({ ...player, encounterName: "" })).toBeNull()
  })

  it("keeps an explicitly selected empty-difficulty zero-size cohort exact", () => {
    const exact = query({ ...player, cohort: { ...cohort, difficulty: "", maxPlayers: 0 } })
    expect(exact.params.has("difficulty_name")).toBe(true)
    expect(exact.params.get("difficulty_name")).toBe("")
    expect(exact.params.get("max_players")).toBe("0")
    expect(liveRatingURL({ ...player, cohort: undefined })).toBeNull()
    expect(liveRatingURL({ ...player, cohort: { ...cohort, maxPlayers: -1 } })).toBeNull()
  })

  it("keeps guild cohorts free of player dimensions, and renown career free of cohorts", () => {
    const guild = query({ ...player, subject: "guild", metric: "peak", cohort: { difficulty: "Heroic", maxPlayers: 40 }, encounterName: "Ragnaros" })
    expect(guild.path).toContain("/guild-boss-leaderboard")
    for (const field of ["class", "spec", "sub_spec", "performance_metric", "group_id"]) expect(guild.params.has(field)).toBe(false)
    const renown = query({ ...player, subject: "guild", metric: "renown", window: "career", cohort: undefined })
    expect(renown.path).toContain("/guild-scope-leaderboard")
    expect(renown.params.get("max_players")).toBe("0")
    expect(renown.params.get("difficulty_name")).toBe("")
    expect(query({ ...player, metric: "renown", window: "career", cohort: undefined }).params.get("performance_metric")).toBe("none")
    expect(liveRatingURL({ ...player, metric: "renown", window: "all_time", cohort: undefined })).toBeNull()
    expect(liveRatingURL({ ...player, metric: "renown", window: "career" })).toBeNull()
    expect(liveRatingURL({ ...player, window: "career" })).toBeNull()
  })

  it("passes only a canonical display-only realm filter", () => {
    const a = query({ ...player, realmIDs: ["b", "a", "b"] })
    expect(a.params.get("realm_ids")).toBe("a,b")
    expect(query(player).params.has("realm_ids")).toBe(false)
  })
})

describe("live rating cursor", () => {
  it("fetches the published page and preserves cursor encoding", async () => {
    const page = { entries: [{ player_guid: "real-guid", score: 42 }], next_cursor: "next/==" }
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => page })
    vi.stubGlobal("fetch", fetcher)
    expect(await fetchLiveRatingPage("/ratings?limit=50", "previous/==")).toEqual(page)
    expect(fetcher).toHaveBeenCalledWith("/ratings?limit=50&cursor=previous%2F%3D%3D")
  })
  it("signals a stale cursor separately from request failure and rejects malformed payloads", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ status: 409, ok: false })
      .mockResolvedValueOnce({ status: 503, ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ entries: null }) })
    vi.stubGlobal("fetch", fetcher)
    await expect(fetchLiveRatingPage("/ratings?limit=50", "old")).rejects.toBeInstanceOf(StaleRatingCursorError)
    await expect(fetchLiveRatingPage("/ratings?limit=50")).rejects.toThrow("503")
    await expect(fetchLiveRatingPage("/ratings?limit=50")).rejects.toThrow("Invalid ratings response")
  })
})
