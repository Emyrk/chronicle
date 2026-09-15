import { EMERALD_SANCTUM_INSTANCE } from "../Rankings/emeraldSanctumState"

export type LeaderboardsTab = "dps" | "speedrun"

const INSTANCES_WITHOUT_SPEEDRUNS = new Set([EMERALD_SANCTUM_INSTANCE])

export function supportsSpeedruns(instanceName: string | null): boolean {
  return instanceName === null || !INSTANCES_WITHOUT_SPEEDRUNS.has(instanceName)
}

export function resolveLeaderboardsTab(
  value: string | null,
  instanceName: string | null,
): LeaderboardsTab {
  if (value === "speedrun" && supportsSpeedruns(instanceName)) return "speedrun"
  return "dps"
}
