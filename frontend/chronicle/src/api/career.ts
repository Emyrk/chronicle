import { useQuery } from "@tanstack/react-query"
import type { CareerGuildResponse, CareerPlayerResponse } from "./typesGenerated"

export function playerCareerURL(realm: string, player: string) {
  return `/api/v1/armory/${encodeURIComponent(realm)}/${encodeURIComponent(player)}/career`
}
export function guildCareerURL(id: string) {
  return `/api/v1/guilds/${encodeURIComponent(id)}/career`
}
export async function fetchCareer<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Career scores could not be loaded (${response.status})`)
  return response.json()
}
export function usePlayerCareer(tenantID: string | undefined, realm: string, player: string) {
  return useQuery({ queryKey: ["career", tenantID, "player", realm, player],
    queryFn: () => fetchCareer<CareerPlayerResponse>(playerCareerURL(realm, player)),
    enabled: !!realm && !!player, staleTime: 60_000, retry: false })
}
export function useGuildCareer(tenantID: string | undefined, guildID: string) {
  return useQuery({ queryKey: ["career", tenantID, "guild", guildID],
    queryFn: () => fetchCareer<CareerGuildResponse>(guildCareerURL(guildID)),
    enabled: !!guildID, staleTime: 60_000, retry: false })
}
