import type {
  TenantGuildBossLeaderboardEntry, TenantGuildScopeLeaderboardEntry,
  TenantPlayerBossLeaderboardEntry, TenantPlayerScopeLeaderboardEntry,
} from "@/api/typesGenerated"

export type LiveRatingMetric = "peak" | "mastery" | "ranked_mastery" | "renown"
export type LiveRatingWindow = "period" | "all_time" | "career"
export type LiveRatingCohort = {
  difficulty: string
  maxPlayers: number
  playerClass?: string
  spec?: string
  subSpec?: string
  performance?: "dps" | "hps"
}
export type LiveRatingBoardRequest = {
  instanceName: string
  encounterName?: string
  subject: "player" | "guild"
  metric: LiveRatingMetric
  window: LiveRatingWindow
  cohort?: LiveRatingCohort
  realmIDs?: readonly string[]
}

export type LiveRatingEntry = (TenantPlayerScopeLeaderboardEntry | TenantPlayerBossLeaderboardEntry |
  TenantGuildScopeLeaderboardEntry | TenantGuildBossLeaderboardEntry) & {
    player_name?: string
    guild_name?: string
    realm_name?: string
  }
export type LiveRatingPage = { entries: readonly LiveRatingEntry[]; next_cursor?: string; scope?: string }

/** Missing or mismatched cohorts do not silently fall back to a broader population. */
export function liveRatingURL(request: LiveRatingBoardRequest): string | null {
  const { instanceName, encounterName, subject, metric, window, cohort, realmIDs } = request
  if (!instanceName.trim() || (encounterName !== undefined && !encounterName.trim())) return null
  if (metric === "renown") {
    if (window !== "period" && window !== "career") return null
    if (cohort) return null
  } else {
    if (window !== "period" && window !== "all_time" || !cohort || !Number.isInteger(cohort.maxPlayers) || cohort.maxPlayers < 0) return null
    if (subject === "player" && (!cohort.playerClass?.trim() || cohort.spec === undefined || cohort.subSpec === undefined || !cohort.performance)) return null
  }
  const endpoint = `${subject === "guild" ? "guild-" : ""}${encounterName === undefined ? "scope" : "boss"}-leaderboard`
  const query = new URLSearchParams({
    instance_name: instanceName,
    difficulty_name: metric === "renown" ? "" : cohort!.difficulty,
    max_players: String(metric === "renown" ? 0 : cohort!.maxPlayers),
    rating_metric: metric,
    window_kind: window,
    limit: "50",
  })
  if (encounterName !== undefined) query.set("encounter_name", encounterName)
  if (subject === "player") {
    query.set("performance_metric", metric === "renown" ? "none" : cohort!.performance!)
    if (metric !== "renown") {
      query.set("class", cohort!.playerClass!)
      query.set("spec", cohort!.spec!)
      query.set("sub_spec", cohort!.subSpec!)
    }
  }
  if (realmIDs?.length) query.set("realm_ids", [...new Set(realmIDs)].sort().join(","))
  return `/api/v1/rankings/ratings/${endpoint}?${query}`
}

export class StaleRatingCursorError extends Error {
  constructor() { super("Rating leaderboard changed. Refresh to start from the first page.") }
}

export async function fetchLiveRatingPage(url: string, cursor?: string): Promise<LiveRatingPage> {
  const response = await fetch(cursor ? `${url}&cursor=${encodeURIComponent(cursor)}` : url)
  if (response.status === 409) throw new StaleRatingCursorError()
  if (!response.ok) throw new Error(`Ratings request failed (${response.status})`)
  const page = await response.json() as LiveRatingPage
  if (!Array.isArray(page.entries)) throw new Error("Invalid ratings response")
  return page
}
