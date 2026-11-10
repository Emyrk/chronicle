import type { CareerLeaderboardResponse } from "@/api/typesGenerated"
import type { RatingScope } from "../Ratings/ratingBoards.fixtures"
import { METRIC_THEMES, type RatingView } from "../Ratings/ratingThemes"

export type CareerSubject = "characters" | "guilds"
/** "all" scores each spec with its chosen metric; DPS or Healing forces one. */
export type CareerRole = "all" | "dps" | "healing"

export interface CareerFilters {
  subject: CareerSubject
  role: CareerRole
  scope: RatingScope
  realmID?: string
}

export type CareerBoardsState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: CareerLeaderboardResponse }

/** The banner's section tabs: the overview and one per metric. */
export const CAREER_TABS: { id: RatingView; label: string; icon: (typeof METRIC_THEMES)[RatingView]["icon"]; description: string }[] = [
  { id: "overview", label: "Overview", icon: METRIC_THEMES.overview.icon, description: "The top of each career board side by side." },
  { id: "peak", label: "Peak", icon: METRIC_THEMES.peak.icon, description: "Best performance against the benchmark, weighted across every raid." },
  { id: "mastery", label: "Mastery", icon: METRIC_THEMES.mastery.icon, description: "Repeatable performance, weighted across every raid. Raids without kills count as zero." },
  { id: "renown", label: "Renown", icon: METRIC_THEMES.renown.icon, description: "Kills and clears across every spec. History, not skill." },
]

export function careerLeaderboardParams(filters: CareerFilters, limit: number): URLSearchParams {
  const params = new URLSearchParams({ limit: String(limit) })
  if (filters.subject === "guilds") params.set("subject", "guilds")
  else {
    if (filters.role !== "all") params.set("metric", filters.role === "dps" ? "dps" : "hps")
    if (filters.scope.cls) params.set("class", filters.scope.cls)
    if (filters.scope.spec) params.set("spec", filters.scope.spec)
    if (filters.scope.subSpec) params.set("sub_spec", filters.scope.subSpec)
  }
  if (filters.realmID) params.set("realm", filters.realmID)
  return params
}

export function raidLabel(raid: { instance_name: string; difficulty_name: string; max_players: number }): string {
  return [raid.instance_name, raid.difficulty_name, raid.max_players > 0 ? `${raid.max_players}` : ""].filter(Boolean).join(" ")
}
