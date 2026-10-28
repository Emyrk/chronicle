import type { ArmoryPlayer } from "@/api/typesGenerated"

export function shouldShowPerformanceSearchAd(query: string): boolean {
  return query.trim().length < 2
}

export function performanceAdsSuppressed(
  players: readonly Pick<ArmoryPlayer, "owner_ads_free">[],
): boolean {
  return players.some((player) => player.owner_ads_free)
}
