import { useMemo, type ReactNode } from "react"
import { useQueries } from "@tanstack/react-query"
import {
  fetchLiveRatingPage, liveRatingURL, type LiveRatingCohort, type LiveRatingEntry,
  type LiveRatingMetric,
} from "@/pages/Leaderboards/Ratings/liveRatingAdapter"
import { fetchLiveRatingFullList, liveRatingFullListURL } from "@/pages/Leaderboards/Ratings/liveRatingFullList"
import { LiveGuildRatings } from "./LiveGuildRatings"
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
  /** Published raid cohort; unset class/spec spans all classes/specs. */
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
  const valid = !!ratingCohort?.performance && ratingCohort.performance === (role === "healing" ? "hps" : "dps") &&
    Number.isInteger(ratingCohort.maxPlayers) && ratingCohort.maxPlayers >= 0 &&
    (!scope.cls || scope.cls === cls) && (!scope.spec || scope.spec === spec) && (!scope.subSpec || scope.subSpec === subSpec)
  const exact = valid && !!cls && !!spec && ratingCohort?.playerClass === cls && ratingCohort.spec === spec &&
    ratingCohort.subSpec === (subSpec ?? "") && (!scope.cls || scope.cls === cls) &&
    (!scope.spec || scope.spec === spec) && (!scope.subSpec || scope.subSpec === (subSpec ?? ""))
  const cohort: RatingLiveCohort | undefined = exact ? ratingCohort as RatingLiveCohort : undefined
  const selectedCohort = valid ? exact ? cohort : { ...ratingCohort!, playerClass: cls || undefined,
    spec: scope.spec || undefined, subSpec: scope.spec ? (scope.subSpec ?? "") : undefined } : undefined
  const targets = useMemo(() => [scope, ...(scope.boss ? [] : bosses.map((boss) => ({ ...scope, boss })))], [scope, bosses])
  const requests = targets.flatMap((target) => metrics.map((metric) => ({
    target, metric,
    url: metric === "renown" || selectedCohort ? liveRatingURL({ instanceName, encounterName: target.boss, subject: "player",
      metric: apiMetric(metric), window: apiWindow(metric, period),
      cohort: metric === "renown" ? undefined : selectedCohort, allClasses: metric !== "renown" && !exact, realmIDs }) : null,
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
        subtitle: metric === "renown" ? "Published renown" : `${selectedCohort!.difficulty || "Default"} · ${selectedCohort!.maxPlayers || "Unrecorded size"} · ${exact ? `${cohort!.playerClass} / ${cohort!.spec}` : scope.cls ? `${scope.cls} / All specs` : "All classes / specs"} · ${selectedCohort!.performance!.toUpperCase()}`,
        entries: result.data.entries.map(asEntry).filter((entry): entry is RatingEntry => entry !== null).slice(0, target.boss ? 3 : 10),
      } }
    states.set(id, state)
  })

  if (subject === "guild") {
    return <LiveGuildRatings instanceName={instanceName} bosses={bosses} encounterName={scope.boss}
      onBoss={(boss) => onScope({ boss })} view={view} onView={onView} period={period}
      cohort={ratingCohort} realmIDs={realmIDs} toolbar={toolbar} />
  }
  const live: RatingLiveData = {
    cohort,
    ranksKnown: !realmIDs?.length,
    board: ({ scope: target, metric }) => states.get(JSON.stringify([target, metric])) ?? { status: "error", error: "Published ratings unavailable for this selection." },
    pageKey: JSON.stringify([instanceName, selectedCohort, realmIDs, subject]),
    loadPage: async ({ scope: target, metric, period: selectedPeriod, query, page }) => {
      const url = liveRatingFullListURL({ instanceName, encounterName: target.boss, subject: "player",
        metric: apiMetric(metric), window: apiWindow(metric, selectedPeriod),
        cohort: metric === "renown" ? undefined : selectedCohort, allClasses: metric !== "renown" && !exact,
        realmIDs, query, page })
      if (!url) throw new Error("Exact published rating cohort unavailable")
      return fetchLiveRatingFullList(url)
    },
  }
  return <RatingBoards instanceName={instanceName} bosses={bosses} scope={scope} onScope={onScope}
    view={view} onView={onView} period={period} toolbar={toolbar} live={live} />
}
