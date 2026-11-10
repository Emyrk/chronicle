import type { CareerLeaderboardEntry, CareerLeaderboardResponse } from "@/api/typesGenerated"
import type { RatingEntry } from "../Ratings/ratingBoards.fixtures"

export type CareerMetric = "mastery" | "peak" | "renown"
export const CAREER_METRICS: CareerMetric[] = ["mastery", "peak", "renown"]

export type CareerBoardsState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: CareerLeaderboardResponse }

/** A career board row in the shape the rating boards draw. */
export function careerRatingEntry(entry: CareerLeaderboardEntry, metric: CareerMetric): RatingEntry {
  const renown = metric === "renown"
  return {
    id: `${entry.realm_id}|${entry.player_guid}`,
    name: entry.player_name,
    realm: entry.realm_name,
    realmLabel: entry.realm_name,
    guid: entry.player_guid,
    guild: entry.guild_name || undefined,
    cls: entry.player_class,
    // Renown spans every spec, so its rows show the class instead of a spec.
    spec: renown ? "" : entry.player_spec,
    subSpec: renown ? "" : entry.player_sub_spec,
    score: (renown ? entry.renown : entry[metric]) ?? 0,
    detail: "",
  }
}
