import type { PublishedGuildFullListResponse, PublishedPlayerFullListResponse } from "@/api/typesGenerated"
import type { RatingEntry, RatingMetric } from "./ratingBoards.fixtures"
import type { RatingLivePage } from "./ratingLiveData"
import { liveRatingURL, type LiveRatingBoardRequest, type LiveRatingEntry } from "./liveRatingAdapter"

export type LiveFullListRequest = LiveRatingBoardRequest & { query: string; page: number }

/** Use the same cohort validation and filters as the published preview boards. */
export function liveRatingFullListURL(request: LiveFullListRequest): string | null {
  if (request.subject !== "player" || !Number.isInteger(request.page) || request.page < 0) return null
  const board = liveRatingURL(request)
  if (!board) return null
  const url = new URL(board, "http://localhost")
  url.pathname = "/api/v1/rankings/ratings/player-full-list"
  url.searchParams.set("query", request.query.trim())
  url.searchParams.set("page", String(request.page))
  url.searchParams.set("limit", "50")
  return url.pathname + url.search
}

function asEntry(row: LiveRatingEntry): RatingEntry | undefined {
  if (!("player_guid" in row)) return undefined
  return {
    id: `${row.realm_id}:${row.player_guid}`,
    name: row.player_name || row.player_guid,
    guild: row.guild_name,
    cls: row.player_class,
    spec: row.player_spec,
    subSpec: row.player_sub_spec,
    score: row.score,
    detail: row.realm_name || row.realm_id,
    publishedMastery: "eligible_kills" in row ? {
      peak: row.best_locked_parse ?? undefined, form: row.form ?? undefined,
      floor: row.floor_score ?? undefined, eligibleKills: row.eligible_kills,
    } : undefined,
  }
}

export async function fetchLiveRatingFullList(url: string): Promise<RatingLivePage> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Ratings full list failed (${response.status})`)
  const result = await response.json() as PublishedPlayerFullListResponse
  if (!Array.isArray(result.rows) || !Number.isInteger(result.total)) throw new Error("Invalid full list response")
  return {
    rows: result.rows.flatMap((row) => {
      const entry = asEntry(row.entry)
      if (!entry) return []
      const scores: Partial<Record<RatingMetric, RatingEntry>> = {}
      for (const metric of ["peak", "mastery", "renown"] as const) {
        const score = row.scores?.[metric]
        if (score !== undefined && score !== null) scores[metric] = { ...entry, score }
      }
      return [{ rank: row.rank, entry, scores }]
    }),
    total: result.total,
    page: result.page,
    hasPreviousPage: result.page > 0,
    hasNextPage: result.has_next_page,
  }
}

export function liveGuildFullListURL(request: LiveFullListRequest): string | null {
  if (request.subject !== "guild" || !Number.isInteger(request.page) || request.page < 0) return null
  const board = liveRatingURL(request)
  if (!board) return null
  const url = new URL(board, "http://localhost")
  url.pathname = "/api/v1/rankings/ratings/guild-full-list"
  url.searchParams.set("query", request.query.trim())
  url.searchParams.set("page", String(request.page))
  url.searchParams.set("limit", "50")
  return url.pathname + url.search
}

export async function fetchLiveGuildFullList(url: string): Promise<PublishedGuildFullListResponse> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Guild ratings full list failed (${response.status})`)
  const result = await response.json() as PublishedGuildFullListResponse
  if (!Array.isArray(result.rows) || !Number.isInteger(result.total)) throw new Error("Invalid guild full list response")
  return result
}
