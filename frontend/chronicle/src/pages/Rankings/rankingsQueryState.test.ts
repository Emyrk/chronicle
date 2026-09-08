import { describe, expect, it } from "vitest"
import {
  getRankingsQueryEnablement,
  type RankingsMetric,
  type RankingsQueryEnablement,
  type RankingsSubTab,
} from "./rankingsQueryState"

const cases: Array<{
  metric: RankingsMetric
  subTab: RankingsSubTab
  active: keyof RankingsQueryEnablement
}> = [
  { metric: "dps", subTab: "boxplot", active: "playerStats" },
  { metric: "hps", subTab: "boxplot", active: "playerStats" },
  { metric: "dps", subTab: "leaderboard", active: "playerLeaderboard" },
  { metric: "hps", subTab: "leaderboard", active: "playerLeaderboard" },
  { metric: "killtime", subTab: "boxplot", active: "killTimeStats" },
  { metric: "killtime", subTab: "leaderboard", active: "killTimeLeaderboard" },
  { metric: "success", subTab: "boxplot", active: "successRates" },
  { metric: "success", subTab: "leaderboard", active: "successRates" },
]

describe("getRankingsQueryEnablement", () => {
  it.each(cases)("enables only $active for $metric/$subTab", ({ metric, subTab, active }) => {
    const enablement = getRankingsQueryEnablement(metric, subTab, true)

    expect(Object.entries(enablement).filter(([, enabled]) => enabled)).toEqual([[active, true]])
  })

  it("disables all content queries until shared page data is ready", () => {
    expect(getRankingsQueryEnablement("dps", "boxplot", false)).toEqual({
      playerStats: false,
      playerLeaderboard: false,
      killTimeStats: false,
      killTimeLeaderboard: false,
      successRates: false,
    })
  })
})
