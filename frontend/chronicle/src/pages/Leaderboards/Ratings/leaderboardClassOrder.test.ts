import { describe, expect, it } from "vitest"
import { leaderboardClassOrder } from "./leaderboardClassOrder"

describe("leaderboardClassOrder", () => {
  it("includes the database Death Knight identifier for Wrath flavors", () => {
    expect(leaderboardClassOrder(["wrath", "azerothcore"])).toContain("DEATH_KNIGHT")
  })

  it("keeps Death Knight hidden on non-Wrath flavors", () => {
    expect(leaderboardClassOrder(["vanilla", "turtle"])).not.toContain("DEATH_KNIGHT")
  })
})
