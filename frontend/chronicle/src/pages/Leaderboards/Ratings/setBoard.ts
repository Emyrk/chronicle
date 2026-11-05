import type { HubSetBoardResponse, HubSetBoardRow } from "@/api/typesGenerated"
import type { RatingEntry, RatingMetric, RatingPeriod } from "./ratingBoards.fixtures"
import type { RatingLivePage } from "./ratingLiveData"

export interface SetBoardRequest {
  instanceName: string
  /** The chosen bosses; one boss is a set of one. */
  encounters: readonly string[]
  subject: "player" | "guild"
  metric: RatingMetric
  period: RatingPeriod
  cohort: { difficulty: string; maxPlayers: number }
  performance: "dps" | "hps"
  cls?: string
  spec?: string
  subSpec?: string
  realmIDs?: readonly string[]
  query?: string
  page?: number
  limit?: number
}

/** Canonical URL (the cache key) for one page of a chosen-boss board. */
export function setBoardURL(r: SetBoardRequest): string {
  const q = new URLSearchParams({
    instance_name: r.instanceName,
    encounter_names: r.encounters.join(","),
    difficulty_name: r.cohort.difficulty,
    max_players: String(r.cohort.maxPlayers),
    performance_metric: r.performance,
    subject: r.subject,
    rating_metric: r.metric,
  })
  if (r.period === "all") q.set("window", "all")
  if (r.subject === "player" && r.cls) {
    q.set("class", r.cls)
    if (r.spec) q.set("spec", r.spec)
    if (r.spec && r.subSpec) q.set("sub_spec", r.subSpec)
  }
  if (r.realmIDs?.length) q.set("realm_ids", [...new Set(r.realmIDs)].sort().join(","))
  if (r.query?.trim()) q.set("query", r.query.trim())
  if (r.page) q.set("page", String(r.page))
  if (r.limit) q.set("limit", String(r.limit))
  return `/api/v1/rankings/ratings/set-board?${q}`
}

export async function fetchSetBoard(url: string): Promise<HubSetBoardResponse> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Ratings board failed (${response.status})`)
  return (await response.json()) as HubSetBoardResponse
}

/** A set-board row as the boards' entry: the ranked metric's score, Peak's DPS when ranked by Peak. */
export function setBoardEntry(row: HubSetBoardRow, metric: RatingMetric): RatingEntry {
  return {
    id: `${row.realm_id}:${row.subject_id}`,
    name: row.name || row.subject_id,
    realm: row.realm_name,
    guid: row.subject_id,
    guild: row.guild_name || undefined,
    cls: row.player_class,
    spec: row.player_spec,
    subSpec: row.player_sub_spec,
    score: row.score,
    detail: row.realm_name,
    raw: metric === "peak" ? row.peak_raw : undefined,
    publishedMastery: row.mastery_parts
      ? { peak: row.mastery_parts.peak, form: row.mastery_parts.form, floor: row.mastery_parts.floor, eligibleKills: row.mastery_parts.eligible_kills }
      : undefined,
  }
}

/** A set-board page in the full table's shape, with every row's three scores. */
export function setBoardPage(result: HubSetBoardResponse, metric: RatingMetric): RatingLivePage {
  return {
    rows: result.rows.map((row) => {
      const entry = setBoardEntry(row, metric)
      return {
        rank: row.rank,
        entry,
        peakComponents: row.peak_components,
        scores: {
          peak: { ...entry, score: row.peak, raw: row.peak_raw },
          mastery: { ...entry, score: row.mastery, raw: undefined },
          renown: { ...entry, score: row.renown, raw: undefined },
        },
      }
    }),
    total: result.total,
    page: result.page,
    hasPreviousPage: result.page > 0,
    hasNextPage: result.has_next_page,
  }
}
