import { ChevronLeft, ChevronRight, Timer } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RankingsLeaderboardResponse } from "@/api/typesGenerated"
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { RankingsTable } from "@/pages/Rankings/RankingsTable"
import { MOBILE_EDGE_TO_EDGE } from "@/pages/Leaderboards/Hub/edgeToEdge"
import type { RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { performanceEntries, type HubRole, type HubSubject } from "./hub.fixtures"

/**
 * Best single-log DPS or HPS: today's statistics leaderboard table, filtered by the hub instead of its
 * own class/spec chips. Boss comes from the encounter list, class/spec from the picker bar, the
 * metric from the role toggle. Rows link to the log.
 */
export function PerformancesTab({
  instanceName,
  scope,
  role,
  subject,
  bosses,
  where,
  onSpeedruns,
  page = 1,
  pageSize = 50,
  onPage,
  live,
}: {
  instanceName: string
  scope: RatingScope
  role: HubRole
  subject: HubSubject
  /** Bosses in the selection (the whole raid on a full clear). */
  bosses: readonly string[]
  where: string
  onSpeedruns: () => void
  page?: number
  pageSize?: number
  onPage?: (page: number) => void
  /** When provided, use only parent-loaded API results, never story fixtures. */
  live?: { response?: RankingsLeaderboardResponse; loading?: boolean; error?: Error | null }
}) {
  if (subject === "guilds") {
    // A guild's single best performance is its run time, which the Speedruns tab ranks.
    return (
      <div className="rounded-xl border bg-card px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">A guild's best performance is its fastest run.</p>
        <button
          type="button"
          onClick={onSpeedruns}
          className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          <Timer className="size-4" />
          Open Speedruns
        </button>
      </div>
    )
  }
  const metric = role === "dps" ? "dps" : "hps"
  const who = scope.spec
    ? `${scope.subSpec ? `${scope.spec} (${scope.subSpec})` : scope.spec} ${CLASS_DISPLAY[scope.cls!]}`
    : scope.cls
      ? CLASS_DISPLAY[scope.cls]
      : "All players"
  const totalCount = live?.response?.total_count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const rankOffset = (page - 1) * pageSize
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold">
          Best {metric.toUpperCase()} · {where}
        </h2>
        <span className="text-xs text-muted-foreground">
          {who} · {scope.boss ? "one kill each" : "best single kill on any boss"}
        </span>
      </div>
      {live?.error ? (
        <div role="alert" className="rounded-xl border p-8 text-center text-muted-foreground">Could not load performances: {live.error.message}</div>
      ) : (
        <>
          <RankingsTable
            entries={live ? (live.response?.entries.map((entry, i) => ({ ...entry, rank: rankOffset + i + 1 })) ?? []) : performanceEntries(scope, role, instanceName, bosses)}
            metric={metric}
            loading={live ? (live.loading || !live.response) : undefined}
            mobileListClassName={MOBILE_EDGE_TO_EDGE}
          />
          {onPage && totalPages > 1 && (
            <div className="flex items-center justify-between px-1 pt-2">
              <span className="text-xs text-muted-foreground">{totalCount.toLocaleString()} players</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1}
                  aria-label="Previous page" onClick={() => onPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages}
                  aria-label="Next page" onClick={() => onPage(page + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
