import { useRefreshLeaderboardHighlights } from "@/api/leaderboardHighlights"
import { Button } from "@/components/ui/button"

export function AdminLeaderboardHighlights({ tenantID }: { tenantID: string }) {
  const refresh = useRefreshLeaderboardHighlights(tenantID)
  return <section aria-label="Landing highlights" className="space-y-2 rounded-md border p-3">
    <p className="text-sm font-medium">Landing highlights</p>
    <p className="text-xs text-muted-foreground">Refresh this tenant's all-realms and per-realm card snapshots from existing leaderboard data. This does not backfill historical runs.</p>
    <Button variant="outline" disabled={refresh.isPending} onClick={() => refresh.mutate()}>
      {refresh.isPending ? "Queueing refresh…" : "Refresh highlights"}
    </Button>
    {refresh.isSuccess && <p role="status" className="text-xs text-muted-foreground">Highlight refresh queued, not yet complete. Existing snapshots remain visible while workers prepare replacements.</p>}
    {refresh.isError && <p role="alert" className="text-xs text-destructive">Could not queue highlight refresh: {refresh.error.message}</p>}
  </section>
}
