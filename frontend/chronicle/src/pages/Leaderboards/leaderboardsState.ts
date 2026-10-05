import { EMERALD_SANCTUM_INSTANCE } from "../Rankings/emeraldSanctumState"

export type LeaderboardsMode = "statistics" | "speedruns"

const INSTANCES_WITHOUT_SPEEDRUNS = new Set([EMERALD_SANCTUM_INSTANCE])

export function leaderboardsModePath(mode: LeaderboardsMode): string {
  return `/leaderboards/${mode}`
}

export function leaderboardsModeTarget(mode: LeaderboardsMode, source: URLSearchParams): string {
  const params = new URLSearchParams(source)
  if (mode === "speedruns" || params.get("tab") === "speedrun") {
    params.delete("tab")
  }
  const query = params.toString()
  return `${leaderboardsModePath(mode)}${query ? `?${query}` : ""}`
}

export function legacyLeaderboardsTarget(source: URLSearchParams): string {
  const mode: LeaderboardsMode = source.get("tab") === "speedrun" ? "speedruns" : "statistics"
  return leaderboardsModeTarget(mode, source)
}

export function supportsSpeedruns(instanceName: string | null): boolean {
  return instanceName === null || !INSTANCES_WITHOUT_SPEEDRUNS.has(instanceName)
}
