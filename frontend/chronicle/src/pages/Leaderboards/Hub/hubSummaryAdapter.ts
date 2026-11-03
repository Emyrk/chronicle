import { keepPreviousData, useQuery } from "@tanstack/react-query"
import type { HubSummary, HubPlayerRatingEntry, HubGuildRatingEntry } from "@/api/typesGenerated"
import type { LiveRatingCohort } from "@/pages/Leaderboards/Ratings/liveRatingAdapter"

export type { HubSummary, HubPlayerRatingEntry, HubGuildRatingEntry }

export type HubSummaryRequest = {
  instanceName?: string
  tab?: "overview" | "ratings" | "performances" | "speedruns" | "statistics" | "parsing" | "rulesets"
  /** Chosen bosses; empty is the instance's preset. */
  encounters?: readonly string[]
  /** Rating window: the last 180 days (default) or all time. */
  window?: "period" | "all"
  /** Leaders per boss board: 1 (overview, default) or 3 (Ratings tab, which also gets ten raid rows). */
  bossDepth?: 1 | 3
  cohort?: LiveRatingCohort
  performance: "dps" | "hps"
  cls?: string
  spec?: string
  subSpec?: string
  realmIDs?: readonly string[]
}

/** Canonical URL is the CDN cache key; no per-user parameters or cursor. */
export function hubSummaryURL({ instanceName, tab, encounters = [], window, bossDepth, cohort, performance, cls, spec, subSpec, realmIDs }: HubSummaryRequest) {
  const query = new URLSearchParams()
  if (instanceName) query.set("instance_name", instanceName)
  if (!instanceName && tab && tab !== "overview") query.set("tab", tab)
  if (instanceName && cohort) {
    query.set("difficulty_name", cohort.difficulty)
    query.set("max_players", String(cohort.maxPlayers))
  }
  if (instanceName) query.set("performance_metric", performance)
  if (instanceName && encounters.length === 1) query.set("encounter_name", encounters[0])
  if (instanceName && encounters.length > 1) query.set("encounter_names", encounters.join(","))
  if (instanceName && window === "all") query.set("window", "all")
  if (instanceName && bossDepth === 3) query.set("boss_depth", "3")
  if (cls) query.set("class", cls)
  if (spec) query.set("spec", spec)
  if (subSpec) query.set("sub_spec", subSpec)
  if (realmIDs?.length) query.set("realm_ids", [...new Set(realmIDs)].sort().join(","))
  return `/api/v1/rankings/ratings/hub-summary${query.size ? `?${query}` : ""}`
}

export function useHubSummary(request: HubSummaryRequest, enabled = true) {
  const url = hubSummaryURL(request)
  return useQuery({
    queryKey: ["hub-summary", url],
    queryFn: async () => {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Hub summary failed (${response.status})`)
      return response.json() as Promise<HubSummary>
    },
    staleTime: 5 * 60 * 1000,
    enabled,
    retry: false,
    // A new selection keeps the last summary on screen (flagged isPlaceholderData), so the
    // page never blanks; content checks the flag and shows its skeleton instead.
    placeholderData: keepPreviousData,
  })
}
