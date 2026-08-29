export type SpeedrunTimingMode = "ranked" | "full"

export const SPEEDRUN_TIMING_STORAGE_KEY = "chronicle-speedrun-timing"

export function resolveSpeedrunTimingMode(
  urlValue: string | null,
  storedValue: unknown,
): SpeedrunTimingMode {
  if (urlValue === "ranked" || urlValue === "full") return urlValue
  return storedValue === "ranked" ? "ranked" : "full"
}
