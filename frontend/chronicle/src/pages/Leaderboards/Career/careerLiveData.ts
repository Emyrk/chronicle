import type { CareerLeaderboardEntry, CareerLeaderboardResponse } from "@/api/typesGenerated"
import type { GuildRatingData } from "../Hub/GuildRatings"
import { RATING_METRICS, type RatingEntry, type RatingMetric } from "../Ratings/ratingBoards.fixtures"
import { fetchCareer } from "@/api/career"
import type { PeakComponentLabels, RatingLiveData, RatingLivePage } from "../Ratings/ratingLiveData"
import { raidLabel, type CareerBoardsState } from "./careerLeaderboardModel"

const PAGE_SIZE = 50

/** Career Peak is a weighted mean of raids, not a plain mean of bosses. */
export const CAREER_PEAK_LABELS: PeakComponentLabels = {
  noun: "raids",
  header: "Raid peaks",
  note: (count) => `weighted across ${count}, misses count 0`,
  description: (count) => `Peak is the weighted average of all ${count} raids' Peak, heavier raids counting more; a raid without a kill counts as 0.`,
}

/** One career row in the shape the hub's rating tables draw. */
export function careerEntry(e: CareerLeaderboardEntry, metric: RatingMetric, guilds: boolean): RatingEntry {
  const renown = metric === "renown"
  const bossCounts = e.raids.flatMap((r) => r.bosses)
  return {
    id: JSON.stringify([e.realm_id, e.subject_id]),
    name: e.name,
    guild: e.guild_name || undefined,
    logo: e.logo_url || undefined,
    realm: e.realm_id,
    realmLabel: e.realm_name?.trim() || "Unknown realm",
    guid: e.subject_id,
    cls: guilds ? "" : e.player_class,
    // Renown spans every spec, so its rows have no spec.
    spec: guilds || renown ? "" : e.player_spec,
    subSpec: guilds || renown ? "" : e.player_sub_spec,
    score: (renown ? e.renown : e[metric]) ?? 0,
    detail: e.realm_id,
    publishedMastery: renown ? undefined : { peak: e.peak ?? undefined, form: e.form ?? undefined, floor: e.floor ?? undefined },
    // Rows published before boss counts existed show kill progress as unknown.
    bossCounts: renown || bossCounts.length === 0 ? undefined : bossCounts,
  }
}

/** The weighted raids behind every entry (all entries share the same raid list). */
export function careerRaids(data?: CareerLeaderboardResponse): string[] {
  const any = data && [...data.mastery.entries, ...data.peak.entries][0]
  return any ? any.raids.map(raidLabel) : []
}

/** One page of a career board, ranked and searched on the server. */
async function careerPage(base: URLSearchParams, guilds: boolean, { metric, query, page }: { metric: RatingMetric; query: string; page: number }): Promise<RatingLivePage> {
  const params = new URLSearchParams(base)
  params.set("limit", String(PAGE_SIZE))
  params.set("offset", String(page * PAGE_SIZE))
  if (query.trim()) params.set("search", query.trim())
  const board = (await fetchCareer<CareerLeaderboardResponse>(`/api/v1/leaderboards-v2/career?${params}`))[metric]
  return {
    rows: board.entries.map((e) => ({
      rank: 0,
      entry: careerEntry(e, metric, guilds),
      scores: Object.fromEntries(RATING_METRICS.map((m) => [m, careerEntry(e, m, guilds)])),
      peakComponents: e.raids.map((r) => ({ encounter_name: raidLabel(r), score: r.kills > 0 ? r.peak : 0 })),
    })),
    total: board.total,
    page,
    hasPreviousPage: page > 0,
    hasNextPage: (page + 1) * PAGE_SIZE < board.total,
  }
}

/**
 * The career boards as the hub's rating data source: top boards from the
 * loaded response, full tables paged from the API.
 */
export function careerLiveData(state: CareerBoardsState, guilds: boolean, base: URLSearchParams): RatingLiveData {
  return {
    ranksKnown: false,
    catchupStatus: false,
    peakLabels: CAREER_PEAK_LABELS,
    pageKey: base.toString(),
    board: ({ scope, metric }) => {
      if (state.status !== "ready") return state
      return {
        status: "ready",
        data: {
          id: scope.boss ?? "career",
          kind: scope.boss ? "boss" : "raid",
          scope,
          title: scope.boss ?? "Career",
          subtitle: `${careerRaids(state.data).length} raids, weighted · a raid without a kill counts as 0`,
          entries: scope.boss ? [] : state.data[metric].entries.map((e) => careerEntry(e, metric, guilds)),
          total: scope.boss ? 0 : state.data[metric].total,
        },
      }
    },
    loadPage: (selection) => careerPage(base, guilds, selection),
  }
}

/** Guild boards read their top lists from `ratings` and their full table from `live`. */
export function careerGuildData(state: CareerBoardsState, base: URLSearchParams): GuildRatingData {
  const data = state.status === "ready" ? state.data : undefined
  const ratings = Object.fromEntries(RATING_METRICS.map((m) => [m, (data?.[m].entries ?? []).map((e) => ({
    guild: e.name,
    guildId: e.subject_id,
    logo: e.logo_url || undefined,
    identity: `${e.realm_id}:${e.subject_id}`,
    score: (m === "renown" ? e.renown : e[m]) ?? 0,
    detail: e.realm_id,
  }))])) as unknown as GuildRatingData["ratings"]
  return {
    ratings,
    perBoss: () => undefined,
    pending: state.status === "loading",
    error: state.status === "error" ? state.error : undefined,
    live: careerLiveData(state, true, base),
  }
}
