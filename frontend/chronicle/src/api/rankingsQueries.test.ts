import { describe, expect, it } from "vitest"
import { rankingsLeaderboardSearchParams } from "./rankingsQueries"

describe("rankingsLeaderboardSearchParams", () => {
  it("preserves every supported leaderboard filter and pagination value", () => {
    const params = rankingsLeaderboardSearchParams({
      instance_names: "Naxxramas",
      encounter_names: "Patchwerk,Grobbulus",
      difficulty_names: "Normal",
      realm_names: "Tel'Abim,Turtle WoW",
      period: "30d",
      class: "Shaman",
      spec: "Enhancement",
      sub_spec: "Spellhance",
      role: "dps",
      hide_unknowns: true,
      metric: "hps",
      max_players: 40,
      limit: 50,
      offset: 100,
    })

    expect(Object.fromEntries(params)).toEqual({
      instance_names: "Naxxramas",
      encounter_names: "Patchwerk,Grobbulus",
      difficulty_names: "Normal",
      realm_names: "Tel'Abim,Turtle WoW",
      period: "30d",
      class: "Shaman",
      spec: "Enhancement",
      sub_spec: "Spellhance",
      role: "dps",
      hide_unknowns: "true",
      metric: "hps",
      max_players: "40",
      limit: "50",
      offset: "100",
    })
  })

  it("omits default and empty values", () => {
    expect(rankingsLeaderboardSearchParams({ metric: "dps" }).toString()).toBe("")
  })
})
