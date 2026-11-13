import { describe, expect, it } from "vitest"
import type { ArmorySearchResult, LeaderboardV2PlayerHistoryGroup } from "@/api/typesGenerated"
import { buildRaidView, datasetFromGroup, playerHistoryURL, raidScopeKey } from "./useMyRatingData"
import { parseRatingsLink, ratingsExplainerHref } from "./ratingsLink"

const character = {
  id: "Player-1234-ABCDEF",
  realm_id: "11111111-2222-3333-4444-555555555555",
  realm_name: "Nordanaar",
  name: "Example",
  class: "WARRIOR",
  race: "Human",
  gender: "Male",
  level: 60,
  updated_at: "2026-11-10T00:00:00Z",
} satisfies ArmorySearchResult

const group = {
  instance_name: "Blackwing Lair",
  difficulty_name: "Normal",
  max_players: 40,
  encounter_name: "Nefarian",
  player_class: "WARRIOR",
  player_spec: "Fury",
  player_sub_spec: "",
  metric: "dps",
  benchmark: 1000,
  renown_award: 9,
  renown_kills: 2,
  kills: [
    { value: 900, parse: 88, killed_at: "2026-11-01T00:00:00Z" },
    { value: 1100, killed_at: "2026-11-08T00:00:00Z" },
  ],
} satisfies LeaderboardV2PlayerHistoryGroup

describe("Armory rating history", () => {
  it("queries player history with an arbitrary Armory character identity", () => {
    expect(playerHistoryURL(character)).toBe(
      "/api/v1/leaderboards-v2/player-history?realm=11111111-2222-3333-4444-555555555555&player=Player-1234-ABCDEF",
    )
  })

  it("builds a rating dataset from an Armory search result", () => {
    const dataset = datasetFromGroup(character, group)

    expect(dataset.key).toContain(`${character.realm_id}|${character.id}|`)
    expect(dataset.benchmark).toBe(1100)
    expect(dataset.kills).toEqual([
      { value: 900, parse: 88, killedAt: "2026-11-01T00:00:00Z" },
      { value: 1100, parse: undefined, killedAt: "2026-11-08T00:00:00Z" },
    ])
  })

  it("rates a raid like the Armory: missing bosses count as zero, Renown sums every metric", () => {
    const healKill = { ...group, encounter_name: "Chromaggus", metric: "hps", renown_award: 2, kills: [{ value: 500, killed_at: "2026-11-01T00:00:00Z" }] }
    const scope = { key: raidScopeKey("WARRIOR|Fury|", "dps"), label: "Fury Warrior", cohort: "WARRIOR|Fury|", metric: "dps", kills: 2 }
    const view = buildRaidView({ key: "bwl", label: "Blackwing Lair", kills: 3 }, [group, healKill], scope, ["Chromaggus", "Nefarian"])

    expect(view.bosses.map((b) => b.encounterName)).toEqual(["Chromaggus", "Nefarian"])
    expect(view.bosses[0]).toMatchObject({ kills: 0, mastery: 0, renown: 2, groupKey: undefined })
    expect(view.bosses[1].peak).toBe(100)
    expect(view.peak).toBe(50)
    expect(view.mastery).toBeCloseTo(view.bosses[1].mastery / 2)
    expect(view.renown).toBe(2 + 18)
  })
})

describe("ratings deep link", () => {
  it("round-trips a character, raid, spec, and metric", () => {
    const link = { realm: "Nordanaar", player: "Player-1", raid: "Blackwing Lair|Normal|40", spec: "WARRIOR|Fury|", metric: "dps" }
    const href = ratingsExplainerHref(link)
    expect(parseRatingsLink(new URLSearchParams(href.split("?")[1]))).toEqual(link)
  })
})
