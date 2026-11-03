import { useQuery } from "@tanstack/react-query"
import type { HubSummary, HubPlayerRatingEntry, HubGuildRatingEntry } from "@/api/typesGenerated"
import type { LiveRatingCohort } from "@/pages/Leaderboards/Ratings/liveRatingAdapter"

export type { HubSummary, HubPlayerRatingEntry, HubGuildRatingEntry }

export type HubSummaryRequest = {
  instanceName?: string
  encounterName?: string
  cohort?: LiveRatingCohort
  performance: "dps" | "hps"
  cls?: string
  spec?: string
  subSpec?: string
  realmIDs?: readonly string[]
}

/** Canonical URL is the CDN cache key; no per-user parameters or cursor. */
export function hubSummaryURL({ instanceName, encounterName, cohort, performance, cls, spec, subSpec, realmIDs }: HubSummaryRequest) {
  const query = new URLSearchParams()
  if (instanceName) query.set("instance_name", instanceName)
  if (instanceName && cohort) {
    query.set("difficulty_name", cohort.difficulty)
    query.set("max_players", String(cohort.maxPlayers))
  }
  if (instanceName) query.set("performance_metric", performance)
  if (encounterName) query.set("encounter_name", encounterName)
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
  })
}
