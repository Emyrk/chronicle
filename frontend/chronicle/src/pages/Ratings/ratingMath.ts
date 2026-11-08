// Client-side mirror of the leaderboard v2 rating formulas, used only to
// illustrate them on the education page. The authoritative calculation lives in
// database/queries/leaderboard_materialize.sql (bands and raw statistics) and
// database/queries/leaderboard_read.sql (normalization, Mastery, Renown).

export const MASTERY_WEIGHTS = { peak: 0.3, form: 0.5, floor: 0.2 } as const

export type Band = "ignored" | "floor" | "form" | "peak"

/** Band for a 1-based ascending position among n observations. */
export function bandFor(position: number, n: number): Band {
  // Integer division, matching `observations / 5` and `observations * 2 / 5` in SQL.
  const ignoredEnd = Math.floor(n / 5)
  const floorEnd = Math.floor((n * 2) / 5)
  if (position === n) return "peak"
  if (position <= ignoredEnd) return "ignored"
  if (position <= floorEnd) return "floor"
  return "form"
}

export interface RatedKill {
  /** Index in the input (chronological) order. */
  index: number
  value: number
  band: Band
}

export interface PlayerBossRating {
  bands: RatedKill[]
  peak: number
  form: number
  floor: number
  mastery: number
  rawPeak: number
  rawForm: number
  rawFloor: number
}

const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length)

/** Normalize a raw player metric against the cohort's best (0 when no benchmark). */
export function normalize(raw: number, benchmark: number): number {
  return benchmark > 0 ? Math.min(100, (100 * raw) / benchmark) : 0
}

/**
 * Rate one player on one boss. Kills are sorted ascending (ties keep input
 * order, standing in for the SQL run_id tie breaker), split into bands, and the
 * raw band means are normalized against the current benchmark.
 */
export function ratePlayerBoss(values: number[], benchmark: number): PlayerBossRating {
  const n = values.length
  const sorted = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value || a.index - b.index)
  const bands = sorted.map((k, i) => ({ ...k, band: bandFor(i + 1, n) }))
  const pick = (band: Band) => bands.filter((k) => k.band === band).map((k) => k.value)
  const rawPeak = n === 0 ? 0 : sorted[n - 1].value
  const rawForm = mean(pick("form"))
  const rawFloor = mean(pick("floor"))
  const peak = normalize(rawPeak, benchmark)
  const form = normalize(rawForm, benchmark)
  const floor = normalize(rawFloor, benchmark)
  const mastery = MASTERY_WEIGHTS.peak * peak + MASTERY_WEIGHTS.form * form + MASTERY_WEIGHTS.floor * floor
  return { bands, peak, form, floor, mastery, rawPeak, rawForm, rawFloor }
}

/** Fixed-denominator average: bosses without kills count as zero. */
export function averageAcrossBosses(scores: (number | null)[]): number {
  if (scores.length === 0) return 0
  return scores.reduce<number>((sum, s) => sum + (s ?? 0), 0) / scores.length
}
