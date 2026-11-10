import { useQuery } from "@tanstack/react-query"
import type { CareerGuildResponse, CareerPlayerResponse, LeaderboardV2PlayerHistory } from "./typesGenerated"

export function playerCareerURL(realm: string, player: string) {
  return `/api/v1/armory/${encodeURIComponent(realm)}/${encodeURIComponent(player)}/career`
}
export function guildCareerURL(id: string) {
  return `/api/v1/guilds/${encodeURIComponent(id)}/career`
}
export function playerRatingHistoryURL(realmID: string, player: string) {
  return `/api/v1/leaderboards-v2/player-history?${new URLSearchParams({ realm: realmID, player })}`
}
export async function fetchCareer<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || `Ratings could not be loaded (${response.status})`)
  }
  return response.json()
}
export function usePlayerCareer(tenantID: string | undefined, realm: string, player: string, enabled = true) {
  return useQuery({ queryKey: ["career", tenantID, "player", realm, player],
    queryFn: () => fetchCareer<CareerPlayerResponse>(playerCareerURL(realm, player)),
    enabled: enabled && !!realm && !!player, staleTime: 60_000, retry: false })
}
/** Boss-level kill history behind a character's ratings. */
export function usePlayerRatingHistory(tenantID: string | undefined, realmID: string, player: string, enabled = true) {
  return useQuery({ queryKey: ["leaderboards-v2-player-history", tenantID, realmID, player],
    queryFn: () => fetchCareer<LeaderboardV2PlayerHistory>(playerRatingHistoryURL(realmID, player)),
    enabled: enabled && !!realmID && !!player, staleTime: 60_000, retry: false })
}
export function useGuildCareer(tenantID: string | undefined, guildID: string) {
  return useQuery({ queryKey: ["career", tenantID, "guild", guildID],
    queryFn: () => fetchCareer<CareerGuildResponse>(guildCareerURL(guildID)),
    enabled: !!guildID, staleTime: 60_000, retry: false })
}
