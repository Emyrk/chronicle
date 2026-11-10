import { describe, expect, it } from "vitest"
import type { ArmorySearchResult, LeaderboardV2PlayerHistoryGroup } from "@/api/typesGenerated"
import { datasetFromGroup, playerHistoryURL } from "./useMyRatingData"

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
})
