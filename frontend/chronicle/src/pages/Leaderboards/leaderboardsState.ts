export type LeaderboardsMode = "statistics" | "speedruns" | "parsing"

const INSTANCES_WITHOUT_SPEEDRUNS = new Set(["Emerald Sanctum"])

export function leaderboardsModePath(mode: LeaderboardsMode): string {
  return `/leaderboards/${mode}`
}

/**
 * Builds the URL for switching to `mode`. The parsing tab shares param names
 * (metric, class, spec, period) with statistics but not their meanings, so
 * moving into or out of parsing only carries the instance across.
 */
export function leaderboardsModeTarget(
  mode: LeaderboardsMode,
  source: URLSearchParams,
  from?: LeaderboardsMode,
): string {
  let params = new URLSearchParams(source)
  if (mode !== from && (mode === "parsing" || from === "parsing")) {
    const instance = source.get("instance")
    params = new URLSearchParams(instance ? { instance } : {})
  }
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
