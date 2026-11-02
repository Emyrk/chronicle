import type { RatingScopeLeaderboardResponse } from "@/api/typesGenerated"

export type LiveRatingRequest = {
  realmIDs?: string[]
  instanceName?: string
  metric: "renown" | "peak" | "mastery" | "ranked_mastery"
  window: "period" | "career" | "all_time"
  cohort?: { difficulty: string; maxPlayers: number; playerClass: string; spec: string; subSpec: string; performance: "dps" | "hps" }
}

/** The API publishes exact cohorts. Realm IDs only filter the displayed rows, not scores. */
export function ratingScopeURL(request: LiveRatingRequest): string | null {
  const { realmIDs, instanceName, metric, window, cohort } = request
  if (metric === "renown" ? (window === "all_time" || cohort !== undefined) :
    (!cohort?.playerClass || !cohort.maxPlayers || !["dps", "hps"].includes(cohort.performance) || window === "career" || (metric !== "peak" && window !== "period"))) return null
  const q = new URLSearchParams({
    instance_name: instanceName ?? "",
    difficulty_name: cohort?.difficulty ?? "",
    max_players: String(cohort?.maxPlayers ?? 0),
    rating_metric: metric,
    window_kind: window,
    performance_metric: cohort?.performance ?? "none",
    limit: "50",
  })
  if (cohort) {
    q.set("class", cohort.playerClass)
    q.set("spec", cohort.spec)
    q.set("sub_spec", cohort.subSpec)
  }
  if (realmIDs?.length) q.set("realm_ids", realmIDs.join(","))
  return `/api/v1/rankings/ratings/scope-leaderboard?${q}`
}

export async function fetchLiveRating(url: string): Promise<RatingScopeLeaderboardResponse> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Ratings request failed (${response.status})`)
  return response.json() as Promise<RatingScopeLeaderboardResponse>
}
