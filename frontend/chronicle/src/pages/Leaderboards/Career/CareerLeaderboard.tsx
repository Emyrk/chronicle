import type { CSSProperties } from "react"
import { Link } from "react-router-dom"
import { ArrowUpRight } from "lucide-react"
import type { CareerLeaderboardBoard } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { EntryRow } from "../Ratings/RatingParts"
import { BoardSkeleton, MetricTabs } from "../Ratings/RatingLeaderboard"
import { METRIC_THEMES, type RatingView } from "../Ratings/ratingThemes"
import { CAREER_METRICS, careerRatingEntry, type CareerBoardsState, type CareerMetric } from "./careerLeaderboardModel"

const DESCRIPTIONS: Record<CareerMetric, string> = {
  mastery: "Weighted across every raid, from each character's strongest spec. Raids without kills count as zero.",
  peak: "Best performance against the benchmark, from the same spec as Mastery.",
  renown: "Kills and clears across every spec. History, not skill.",
}

const STATUS_TEXT: Record<string, string> = {
  weights_pending: "Mastery and Peak are not available on this site yet. Renown is unaffected.",
  configuration_pending: "Mastery and Peak are not available on this site yet. Renown is unaffected.",
  no_active_raids: "No raids count toward Mastery and Peak yet.",
}

/**
 * The overall career leaderboard: an overview of the three boards, or one
 * metric's full list. Ranks are not shown, matching the rest of the hub.
 */
export function CareerLeaderboard({ view, onView, state }: {
  view: RatingView
  onView: (view: RatingView) => void
  state: CareerBoardsState
}) {
  const status = state.status === "ready" ? state.data.status : undefined
  const notice = status && status !== "ready" ? STATUS_TEXT[status] ?? "Mastery and Peak are not available yet." : undefined
  const theme = METRIC_THEMES[view]
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6" style={{ "--metric": theme.accent } as CSSProperties}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-wow text-3xl">Career</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every character, across every raid. Mastery and Peak come from each character's strongest spec; Renown adds up every spec.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MetricTabs view={view} onView={onView} />
          <Link to="/ratings" className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
            How ratings work
            <ArrowUpRight className="size-3" />
          </Link>
        </div>
      </header>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      {state.status === "error" && (
        <p role="alert" className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">{state.error}</p>
      )}
      {state.status !== "error" && (view === "overview" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {CAREER_METRICS.map((m) => (
            <CareerBoard key={m} metric={m} board={state.status === "ready" ? state.data[m] : undefined} size="sm" limit={10} onViewAll={() => onView(m)} />
          ))}
        </div>
      ) : (
        <CareerBoard metric={view} board={state.status === "ready" ? state.data[view] : undefined} size="lg" />
      ))}
    </div>
  )
}

function CareerBoard({ metric, board, size, limit, onViewAll }: {
  metric: CareerMetric
  /** Undefined while loading. */
  board?: CareerLeaderboardBoard
  size: "lg" | "sm"
  limit?: number
  onViewAll?: () => void
}) {
  const theme = METRIC_THEMES[metric]
  const entries = board?.entries.slice(0, limit) ?? []
  const total = board?.total ?? 0
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={`${theme.label} career board`}>
      <header className={cn("flex items-start justify-between gap-3 border-b", size === "lg" ? "px-5 py-4" : "px-4 py-3")}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold" style={{ color: theme.accent }}>
            <theme.icon className="size-4" />
            {metric === "mastery" ? "Mastery" : theme.label}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{DESCRIPTIONS[metric]}</p>
        </div>
        {onViewAll && total > 0 && (
          <button type="button" onClick={onViewAll} className="shrink-0 cursor-pointer text-xs text-muted-foreground hover:text-foreground hover:underline">
            All {total.toLocaleString()} →
          </button>
        )}
      </header>
      {!board && <BoardSkeleton />}
      {board && entries.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted-foreground">No characters yet.</p>}
      {entries.length > 0 && (
        <ol>
          {entries.map((e) => <EntryRow key={`${e.realm_id}|${e.player_guid}`} entry={careerRatingEntry(e, metric)} theme={theme} size={size} />)}
        </ol>
      )}
      {size === "lg" && board && total > entries.length && (
        <p className="border-t px-5 py-3 text-xs text-muted-foreground">Showing the top {entries.length.toLocaleString()} of {total.toLocaleString()}.</p>
      )}
    </section>
  )
}
