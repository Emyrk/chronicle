export type RankingsMetric = "dps" | "hps" | "killtime" | "success"
export type RankingsSubTab = "boxplot" | "leaderboard"

export interface RankingsQueryEnablement {
  playerStats: boolean
  playerLeaderboard: boolean
  killTimeStats: boolean
  killTimeLeaderboard: boolean
  successRates: boolean
}

export function getRankingsQueryEnablement(
  metric: RankingsMetric,
  subTab: RankingsSubTab,
  ready: boolean,
): RankingsQueryEnablement {
  const isPlayerMetric = metric === "dps" || metric === "hps"

  return {
    playerStats: ready && isPlayerMetric && subTab === "boxplot",
    playerLeaderboard: ready && isPlayerMetric && subTab === "leaderboard",
    killTimeStats: ready && metric === "killtime" && subTab === "boxplot",
    killTimeLeaderboard: ready && metric === "killtime" && subTab === "leaderboard",
    successRates: ready && metric === "success",
  }
}
