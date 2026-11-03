import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"

/** The throughput behind a Peak score, e.g. "1,312 dps". */
export function formatPeakRaw(raw: number, metric: "dps" | "hps" = "dps") {
  return `${Math.round(raw).toLocaleString()} ${metric}`
}

/** "98.2 · 1,312 dps": Peak with the throughput behind it, wherever one is known. */
export function peakWithRaw(score: number, raw: number | undefined, metric: "dps" | "hps" = "dps") {
  const value = METRIC_THEMES.peak.format(score)
  return raw ? `${value} · ${formatPeakRaw(raw, metric)}` : value
}
