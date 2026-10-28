import { describe, expect, it } from "vitest"
import type { RankingsInstanceSummary } from "@/api/typesGenerated"
import { rankingsSummariesWithStats } from "./rankingsLandingState"

function summary(instanceName: string, totalKills: number): RankingsInstanceSummary {
  return {
    instance_name: instanceName,
    difficulty_name: "",
    max_players: 40,
    category: "raid",
    total_kills: totalKills,
    top_players: [],
  }
}

describe("rankingsSummariesWithStats", () => {
  it("hides leaderboard panels with no statistics", () => {
    expect(
      rankingsSummariesWithStats([
        summary("Onyxia's Lair", 0),
        summary("Molten Core", 12),
      ]),
    ).toEqual([summary("Molten Core", 12)])
  })

  it("handles rankings without any summaries", () => {
    expect(rankingsSummariesWithStats(undefined)).toEqual([])
  })
})
