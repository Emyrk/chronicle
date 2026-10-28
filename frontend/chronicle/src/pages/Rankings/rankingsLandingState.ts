import type { RankingsInstanceSummary } from "@/api/typesGenerated"

export function rankingsSummariesWithStats(
  summaries: RankingsInstanceSummary[] | undefined,
): RankingsInstanceSummary[] {
  return summaries?.filter((summary) => summary.total_kills > 0) ?? []
}
