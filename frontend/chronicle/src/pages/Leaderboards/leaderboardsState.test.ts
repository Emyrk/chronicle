import { describe, expect, it } from "vitest"
import { resolveLeaderboardsTab, supportsSpeedruns } from "./leaderboardsState"

describe("leaderboard tabs", () => {
  it("hides speedruns for Emerald Sanctum", () => {
    expect(supportsSpeedruns("Emerald Sanctum")).toBe(false)
    expect(resolveLeaderboardsTab("speedrun", "Emerald Sanctum")).toBe("dps")
  })

  it("keeps speedruns available globally and for configured instances", () => {
    expect(supportsSpeedruns(null)).toBe(true)
    expect(supportsSpeedruns("Molten Core")).toBe(true)
    expect(resolveLeaderboardsTab("speedrun", null)).toBe("speedrun")
    expect(resolveLeaderboardsTab("speedrun", "Molten Core")).toBe("speedrun")
  })

  it("uses statistics as the absent and invalid default", () => {
    expect(resolveLeaderboardsTab(null, "Emerald Sanctum")).toBe("dps")
    expect(resolveLeaderboardsTab("invalid", "Molten Core")).toBe("dps")
  })
})
