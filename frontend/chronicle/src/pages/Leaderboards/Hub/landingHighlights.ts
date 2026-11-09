import { useQuery } from "@tanstack/react-query"
import type { LeaderboardHighlightsResponse } from "@/api/typesGenerated"
import { hubJSON } from "./resolvedHubAdapter"

export function landingRealmError(ids: readonly string[], realms: readonly { id: string }[]): string | undefined {
  if (ids.length > 1) return "Choose All realms or one realm to view highlights"
  if (ids.length === 1 && !realms.some(realm => realm.id === ids[0])) return "Unknown realm. Choose All realms or one realm to view highlights"
}

export function landingHighlightsURL(realm?: string) {
  return `/api/v1/leaderboards-v2/highlights${realm ? `?${new URLSearchParams({ realm })}` : ""}`
}

export function useLandingHighlights(tenantID: string | undefined, realm: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["leaderboard-highlights", tenantID, realm ?? null],
    queryFn: () => hubJSON<LeaderboardHighlightsResponse>(landingHighlightsURL(realm)),
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    // Never carry another realm's winners over as placeholder data.
  })
}
