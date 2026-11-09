import { useMutation, useQueryClient } from "@tanstack/react-query"
import type { RefreshLeaderboardHighlightsRequest } from "./typesGenerated"
import { operationJSON } from "./leaderboardOperations"

export function refreshLeaderboardHighlights(tenantID: string) {
  const request: RefreshLeaderboardHighlightsRequest = { tenant_id: tenantID }
  return operationJSON<{ message: string }>("/api/v1/admin/leaderboard-highlights/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
}

export function useRefreshLeaderboardHighlights(tenantID: string) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => refreshLeaderboardHighlights(tenantID),
    // Mark this tenant's realm-specific snapshots stale without clearing winners.
    // Queue acceptance is not publication; normal landing polling sees completion.
    onSuccess: () => client.invalidateQueries({ queryKey: ["leaderboard-highlights", tenantID], refetchType: "none" }),
  })
}
