import { describe, expect, it } from "vitest"
import {
  leaderboardsModeTarget,
  legacyLeaderboardsTarget,
  supportsSpeedruns,
} from "./leaderboardsState"

describe("leaderboard routes", () => {
  it("hides speedruns for Emerald Sanctum", () => {
    expect(supportsSpeedruns("Emerald Sanctum")).toBe(false)
  })

  it("keeps speedruns available globally and for configured instances", () => {
    expect(supportsSpeedruns(null)).toBe(true)
    expect(supportsSpeedruns("Molten Core")).toBe(true)
  })

  it("redirects legacy statistics URLs without dropping filters", () => {
    const params = new URLSearchParams("instance=Naxxramas&diff=10+Player&tab=leaderboard&period=30d")

    expect(legacyLeaderboardsTarget(params)).toBe(
      "/leaderboards/statistics?instance=Naxxramas&diff=10+Player&tab=leaderboard&period=30d",
    )
  })

  it("redirects legacy speedrun URLs and consumes the mode parameter", () => {
    const params = new URLSearchParams("tab=speedrun&instance=Naxxramas&realm=Nordanaar&realm=Tel%27Abim&timing=full")

    expect(legacyLeaderboardsTarget(params)).toBe(
      "/leaderboards/speedruns?instance=Naxxramas&realm=Nordanaar&realm=Tel%27Abim&timing=full",
    )
  })

  it("uses statistics as the legacy default", () => {
    expect(legacyLeaderboardsTarget(new URLSearchParams())).toBe("/leaderboards/statistics")
    expect(legacyLeaderboardsTarget(new URLSearchParams("tab=invalid"))).toBe(
      "/leaderboards/statistics?tab=invalid",
    )
  })

  it("preserves statistics subviews while switching routes", () => {
    const params = new URLSearchParams("instance=Molten+Core&tab=leaderboard&page=2")

    expect(leaderboardsModeTarget("statistics", params)).toBe(
      "/leaderboards/statistics?instance=Molten+Core&tab=leaderboard&page=2",
    )
    expect(leaderboardsModeTarget("speedruns", params)).toBe(
      "/leaderboards/speedruns?instance=Molten+Core&page=2",
    )
  })
})
