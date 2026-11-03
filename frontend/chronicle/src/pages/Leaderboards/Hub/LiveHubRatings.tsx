import { useMemo, type ReactNode } from "react"
import { useQueries } from "@tanstack/react-query"
import {
  fetchLiveRatingPage, liveRatingURL, type LiveRatingCohort, type LiveRatingEntry,
  type LiveRatingMetric,
} from "@/pages/Leaderboards/Ratings/liveRatingAdapter"
import { LiveRatingBoards } from "@/pages/Leaderboards/Ratings/LiveRatingBoards"
import { RatingBoards } from "@/pages/Leaderboards/Ratings/RatingLeaderboard"
import type { RatingLiveCohort, RatingLiveData, RatingLiveState, RatingLiveBoard } from "@/pages/Leaderboards/Ratings/ratingLiveData"
import type { RatingEntry, RatingMetric, RatingPeriod, RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import type { RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"

export interface LiveHubRatingsProps {
  instanceName: string
  bosses: readonly string[]
  scope: RatingScope
  onScope: (scope: RatingScope) => void
  view: RatingView
  onView: (view: RatingView) => void
  period: RatingPeriod
  subject: "player" | "guild"
  realmIDs?: readonly string[]
  /** Exact published raid cohort; never broaden an absent class/spec to all players. */
  ratingCohort?: LiveRatingCohort
  cls?: string
  spec?: string
  subSpec?: string
  role: "dps" | "healing"
  toolbar?: ReactNode
}

const metrics: readonly RatingMetric[] = ["peak", "mastery", "renown"]
const apiMetric = (metric: RatingMetric): LiveRatingMetric => metric === "mastery" ? "ranked_mastery" : metric
const apiWindow = (metric: RatingMetric, period: RatingPeriod) => metric === "renown"
  ? period === "all" ? "career" as const : "period" as const
  : period === "all" ? "all_time" as const : "period" as const

function asEntry(row: LiveRatingEntry): RatingEntry | null {
  if (!("player_guid" in row)) return null
  return {
    id: `${row.realm_id}:${row.player_guid}`,
    name: row.player_name || row.player_guid,
    guild: row.guild_name,
    cls: row.player_class,
    spec: row.player_spec,
    subSpec: row.player_sub_spec,
    score: row.score,
    detail: row.realm_name || row.realm_id,
  }
}

/**
 * The published endpoint returns an ordered page, but not rank or total fields.
 * Its first page can supply the board preview; it cannot supply authoritative
 * full-list ranks or a search across the complete cursor chain.
 */
export function LiveHubRatings({
  instanceName, bosses, scope, onScope, view, onView, period, subject, realmIDs,
  ratingCohort, cls, spec, subSpec, role, toolbar,
}: LiveHubRatingsProps) {
  const cohort: RatingLiveCohort | undefined = ratingCohort?.playerClass &&
    ratingCohort.spec !== undefined && ratingCohort.subSpec !== undefined && ratingCohort.performance
    ? ratingCohort as RatingLiveCohort : undefined
  const exact = !!cohort && cohort.playerClass === cls && cohort.spec === (spec ?? "") &&
    cohort.subSpec === (subSpec ?? "") && (!scope.cls || scope.cls === cohort.playerClass) &&
    (!scope.spec || scope.spec === cohort.spec) && (!scope.subSpec || scope.subSpec === cohort.subSpec) && cohort.performance === (role === "healing" ? "hps" : "dps") &&
    Number.isInteger(cohort.maxPlayers) && cohort.maxPlayers >= 0
  const targets = useMemo(() => [scope, ...(scope.boss ? [] : bosses.map((boss) => ({ ...scope, boss })))], [scope, bosses])
  const requests = targets.flatMap((target) => metrics.map((metric) => ({
    target, metric,
    url: metric === "renown" || exact ? liveRatingURL({ instanceName, encounterName: target.boss, subject: "player",
      metric: apiMetric(metric), window: apiWindow(metric, period),
      cohort: metric === "renown" ? undefined : cohort, realmIDs }) : null,
  })))
  const results = useQueries({ queries: requests.map(({ url }) => ({
    queryKey: ["hub-rating-preview", url],
    queryFn: () => fetchLiveRatingPage(url!),
    enabled: !!url && subject === "player",
    staleTime: 5 * 60 * 1000,
    retry: false,
  })) })
  const states = new Map<string, RatingLiveState<RatingLiveBoard>>()
  requests.forEach(({ target, metric, url }, i) => {
    const id = JSON.stringify([target, metric])
    const result = results[i]
    const title = target.boss ?? instanceName
    const state: RatingLiveState<RatingLiveBoard> = !url
      ? { status: "error", error: "Exact published rating cohort unavailable." }
      : result.isError ? { status: "error", error: "Published ratings unavailable." }
      : !result.data ? { status: "loading" }
      : { status: "ready", data: {
        id, kind: target.boss ? "boss" : "raid", scope: target, title,
        subtitle: metric === "renown" ? "Published renown" : `${cohort!.difficulty} · ${cohort!.maxPlayers} players · ${cohort!.playerClass} / ${cohort!.spec} · ${cohort!.performance!.toUpperCase()}`,
        entries: result.data.entries.map(asEntry).filter((entry): entry is RatingEntry => entry !== null).slice(0, target.boss ? 3 : 10),
      } }
    states.set(id, state)
  })

  if (subject === "guild") {
    return <LiveRatingBoards instanceName={instanceName} encounterName={scope.boss} subject="guild"
      metric={apiMetric(view === "overview" ? "peak" : view)} window={apiWindow(view === "overview" ? "peak" : view, period)}
      cohort={view === "renown" ? undefined : ratingCohort} realmIDs={realmIDs} />
  }
  if (!exact && view !== "renown" && view !== "overview") return <p role="status" className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">Choose an exact published raid cohort and matching class, spec, sub-spec, and role to view ratings.</p>

  const live: RatingLiveData = {
    cohort,
    ranksKnown: !realmIDs?.length,
    board: ({ scope: target, metric }) => states.get(JSON.stringify([target, metric])) ?? { status: "error", error: "Published ratings unavailable for this selection." },
    page: ({ query }) => ({ status: "error", error: query
      ? "Search across published pages is unavailable."
      : "The published API does not provide ranks for a full list. Browse published pages below." }),
  }
  return <div className="space-y-5">
    {!exact && <p role="status" className="rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground">Peak and Mastery are ranked within a class, spec, sub-spec, and performance cohort. Select a class and spec above to see their published scores; Renown includes all cohorts.</p>}
    <RatingBoards instanceName={instanceName} bosses={bosses} scope={scope} onScope={onScope}
      view={view} onView={onView} period={period} toolbar={toolbar} live={live} />
    <LiveRatingBoards instanceName={instanceName} encounterName={scope.boss} subject="player"
      metric={apiMetric(view === "overview" ? exact ? "peak" : "renown" : view)}
      window={apiWindow(view === "overview" ? exact ? "peak" : "renown" : view, period)}
      cohort={view === "renown" || (view === "overview" && !exact) ? undefined : cohort} realmIDs={realmIDs} title="Browse published ratings" />
  </div>
}
