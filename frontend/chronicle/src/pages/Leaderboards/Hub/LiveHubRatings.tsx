import { useMemo, type ReactNode } from "react"
import { useQueries } from "@tanstack/react-query"
import type { HubGuildRatingEntry, HubPlayerRatingEntry, HubRatingBoard } from "@/api/typesGenerated"
import { RatingBoards } from "@/pages/Leaderboards/Ratings/RatingLeaderboard"
import type { RatingLiveData, RatingLiveState, RatingLiveBoard } from "@/pages/Leaderboards/Ratings/ratingLiveData"
import { RATING_METRICS, type RatingEntry, type RatingMetric, type RatingPeriod, type RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import type { RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { fetchSetBoard, setBoardPage, setBoardURL } from "@/pages/Leaderboards/Ratings/setBoard"
import { GuildRatingBoards, type GuildRatingData } from "./GuildRatings"
import type { GuildRating } from "./hub.fixtures"
import { useHubSummary } from "./hubSummaryAdapter"

export interface LiveHubRatingsProps {
  instanceName: string
  /** The raid's bosses, in order. */
  bosses: readonly string[]
  /** Hand-picked bosses; empty is the preset (every boss). */
  selected: readonly string[]
  scope: RatingScope
  onScope: (scope: RatingScope) => void
  view: RatingView
  onView: (view: RatingView) => void
  period: RatingPeriod
  subject: "player" | "guild"
  realmIDs?: readonly string[]
  /** The instance's exact raid cohort; Peak and Mastery need one. */
  cohort?: { difficulty: string; maxPlayers: number }
  role: "dps" | "healing"
  where: string
  toolbar?: ReactNode
}

const KEYS: Record<RatingMetric, keyof HubRatingBoard["player"]> = { peak: "peak", mastery: "ranked_mastery", renown: "renown" }

function playerEntry(e: HubPlayerRatingEntry, metric: RatingMetric): RatingEntry {
  return {
    id: `${e.realm_id}:${e.player_guid}`,
    name: e.player_name || e.player_guid,
    cls: e.player_class,
    spec: e.player_spec,
    subSpec: e.player_sub_spec,
    score: e.score,
    detail: e.realm_name,
    raw: metric === "peak" ? e.peak_raw : undefined,
  }
}

function guildRating(e: HubGuildRatingEntry): GuildRating {
  return { guild: e.guild_name || "Unknown guild", score: e.score, detail: e.realm_name }
}

/**
 * The Storybook Ratings tab on published data. The boards and the per-boss cards
 * come from one hub summary request for the selection; the full tables page through
 * the chosen-boss board endpoint (a single boss is a set of one).
 */
export function LiveHubRatings({
  instanceName, bosses, selected, scope, onScope, view, onView, period, subject, realmIDs: realmIDsProp, cohort: cohortProp, role, where, toolbar,
}: LiveHubRatingsProps) {
  // The host rebuilds these each render; key them by value so the boards stay memoized.
  const realmKey = realmIDsProp?.join(",") ?? ""
  const realmIDs = useMemo(() => (realmKey ? realmKey.split(",") : undefined), [realmKey])
  const cohortKey = cohortProp ? `${cohortProp.difficulty}|${cohortProp.maxPlayers}` : ""
  const cohort = useMemo(() => {
    if (!cohortKey) return undefined
    const split = cohortKey.lastIndexOf("|")
    return { difficulty: cohortKey.slice(0, split), maxPlayers: Number(cohortKey.slice(split + 1)) }
  }, [cohortKey])
  const performance = role === "healing" ? "hps" : "dps"
  // The bosses the boards span: one boss, the hand-picked set, or every boss for the preset.
  // Keyed by name, not array identity: the host rebuilds these arrays every render.
  const encountersKey = (scope.boss ? [scope.boss] : selected.length ? selected : bosses).join("\u0000")
  const encounters = useMemo(() => (encountersKey ? encountersKey.split("\u0000") : []), [encountersKey])
  const summary = useHubSummary({
    instanceName, encounters: scope.boss ? [scope.boss] : selected, window: period === "all" ? "all" : "period", bossDepth: 3,
    cohort, performance, cls: subject === "player" ? scope.cls : undefined, spec: subject === "player" ? scope.spec : undefined,
    subSpec: subject === "player" ? scope.subSpec : undefined, realmIDs,
  }, !!cohort)

  // Guilds: whole ranked lists (small) for the browser-side table, one request per metric.
  const guildLists = useQueries({
    queries: RATING_METRICS.map((metric) => {
      const url = cohort ? setBoardURL({ instanceName, encounters, subject: "guild", metric, period, cohort, performance, realmIDs, limit: 500 }) : ""
      return { queryKey: ["hub-guild-set-board", url], queryFn: () => fetchSetBoard(url), enabled: subject === "guild" && !!cohort, staleTime: 5 * 60 * 1000, retry: false }
    }),
  })

  const live = useMemo<RatingLiveData>(() => {
    // The last selection's summary stays as placeholder data while this one loads: not ready yet.
    const data = summary.isPlaceholderData ? undefined : summary.data
    const boardFor = (target: RatingScope): HubRatingBoard | undefined =>
      target.boss ? data?.ratings.bosses.find((b) => b.encounter_name === target.boss) : data?.ratings.raid
    return {
      ranksKnown: true,
      board: ({ scope: target, metric }) => {
        if (!cohort) return { status: "error", error: "No published raid cohort for this instance." }
        if (summary.isError) return { status: "error", error: "Published ratings unavailable." }
        if (!data) return { status: "loading" }
        const rows = boardFor(target)?.player[KEYS[metric]] ?? []
        const board: RatingLiveBoard = {
          id: target.boss ?? "raid",
          kind: target.boss ? "boss" : "raid",
          scope: target,
          title: target.boss ?? where,
          subtitle: target.boss ? "" : `${encounters.length} ${encounters.length === 1 ? "boss" : "bosses"} · a missed boss counts as 0`,
          entries: rows.map((e) => playerEntry(e, metric)),
        }
        return { status: "ready", data: board } satisfies RatingLiveState<RatingLiveBoard>
      },
      pageKey: JSON.stringify([instanceName, encounters, cohort, performance, realmIDs]),
      loadPage: async ({ scope: target, metric, period: selectedPeriod, query, page }) => {
        if (!cohort) throw new Error("No published raid cohort for this instance")
        const url = setBoardURL({
          instanceName, encounters: target.boss ? [target.boss] : encounters, subject: "player", metric, period: selectedPeriod,
          cohort, performance, cls: target.cls, spec: target.spec, subSpec: target.subSpec, realmIDs, query, page, limit: 50,
        })
        return setBoardPage(await fetchSetBoard(url), metric)
      },
    }
  }, [summary.data, summary.isPlaceholderData, summary.isError, cohort, encounters, instanceName, performance, realmIDs, where])

  if (subject === "guild") {
    const failed = guildLists.find((q) => q.isError)
    const data: GuildRatingData = {
      ratings: {
        peak: (guildLists[0].data?.rows ?? []).map((r) => ({ guild: r.name || "Unknown guild", score: r.score, detail: r.realm_name })),
        mastery: (guildLists[1].data?.rows ?? []).map((r) => ({ guild: r.name || "Unknown guild", score: r.score, detail: r.realm_name })),
        renown: (guildLists[2].data?.rows ?? []).map((r) => ({ guild: r.name || "Unknown guild", score: r.score, detail: r.realm_name })),
      },
      perBoss: (boss) => {
        const board = summary.data?.ratings.bosses.find((b) => b.encounter_name === boss)?.guild
        return board && { peak: board.peak.map(guildRating), mastery: board.ranked_mastery.map(guildRating), renown: board.renown.map(guildRating) }
      },
      pending: !!cohort && guildLists.some((q) => q.isPending),
      error: !cohort ? "No published raid cohort for this instance." : failed ? "Published guild ratings unavailable." : undefined,
    }
    return (
      <GuildRatingBoards
        instanceName={instanceName}
        view={view}
        onView={onView}
        bosses={scope.boss ? [scope.boss] : selected.length ? selected : undefined}
        allBosses={bosses}
        where={where}
        onBoss={(boss) => onScope({ boss })}
        toolbar={toolbar}
        data={data}
      />
    )
  }
  return (
    <RatingBoards instanceName={instanceName} bosses={encounters} scope={scope} onScope={onScope}
      view={view} onView={onView} period={period} toolbar={toolbar} live={live} title={where} />
  )
}
