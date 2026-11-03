import { afterEach, describe, expect, it, vi } from "vitest"
import { fetchLiveRatingFullList, liveRatingFullListURL } from "./liveRatingFullList"

afterEach(() => vi.unstubAllGlobals())

const cohort = { difficulty: "", maxPlayers: 0, performance: "dps" as const }

describe("published full-list adapter", () => {
  it("preserves exact zero-size cohorts and search, including all-class selection", () => {
    const url = liveRatingFullListURL({ instanceName: "Molten Core", encounterName: "Ragnaros",
      subject: "player", metric: "ranked_mastery", window: "period", cohort,
      allClasses: true, query: "Mage", page: 2, realmIDs: ["realm-id"] })!
    const parsed = new URL(url, "http://localhost")
    expect(parsed.pathname).toBe("/api/v1/rankings/ratings/player-full-list")
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({ encounter_name: "Ragnaros", difficulty_name: "",
      max_players: "0", all_classes: "true", query: "Mage", page: "2", realm_ids: "realm-id",
      rating_metric: "ranked_mastery" })
  })

  it("uses published global ranks, total and cross-metric scores without renumbering", async () => {
    const entry = { realm_id: "realm-id", player_guid: "mage-id", player_name: "Actual Mage",
      player_class: "MAGE", player_spec: "Fire", player_sub_spec: "", score: 55, realm_name: "Realm" }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      rows: [{ rank: 17, entry, scores: { peak: 76, mastery: 55, renown: 12 } }],
      total: 123, page: 1, has_next_page: true,
    }) }))
    const result = await fetchLiveRatingFullList("/api/v1/rankings/ratings/player-full-list")
    expect(result).toMatchObject({ total: 123, page: 1, hasPreviousPage: true, hasNextPage: true,
      rows: [{ rank: 17, entry: { name: "Actual Mage", score: 55 }, scores: { peak: { score: 76 }, mastery: { score: 55 }, renown: { score: 12 } } }] })
  })
})
