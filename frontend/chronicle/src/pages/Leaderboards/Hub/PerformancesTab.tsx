import { Timer } from "lucide-react"
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
        <RankingsTable
          entries={live ? (live.response?.entries.map((entry, i) => ({ ...entry, rank: i + 1 })) ?? []) : performanceEntries(scope, role, instanceName, bosses)}
          metric={metric}
          loading={live ? (live.loading || !live.response) : undefined}
          mobileListClassName={MOBILE_EDGE_TO_EDGE}
        />
      )}
    </div>
  )
}
