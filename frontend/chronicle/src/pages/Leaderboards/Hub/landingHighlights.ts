import { useQuery } from "@tanstack/react-query"
import type { HubLandingPreview } from "@/api/typesGenerated"
import { hubJSON } from "./resolvedHubAdapter"

// Mirrors the persisted highlights contract; generated SDK integration owns these types.
export interface LandingSnapshot {
  instance_name: string
  difficulty_name: string
  max_players: number
  status: "not_prepared" | "ready" | "empty" | "stale"
  refreshed_at?: string | null
  configuration_fingerprint: string
}
export interface LandingHighlights {
  status: string
  landing_previews: readonly HubLandingPreview[]
  snapshots: readonly LandingSnapshot[]
}

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
    queryFn: () => hubJSON<LandingHighlights>(landingHighlightsURL(realm)),
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    // Never carry another realm's winners over as placeholder data.
  })
}
