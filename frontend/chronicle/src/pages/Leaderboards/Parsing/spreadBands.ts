import type { ParseScoreSpread, RankingsFilterClass } from "@/api/typesGenerated"
import { niceStep } from "@/pages/Parsing/cohort/cohortStats"

export interface SpreadBand {
  /** Parse tier floor the band belongs to (0, 25, 50, 75, 95, 99, 100). */
  floor: number
  start: number
  end: number
}

/** Cutoff value for a tier floor, or null if nobody reached it. */
export function spreadCutoff(spread: ParseScoreSpread, floor: number): number | null {
  return spread.cutoffs.find((cutoff) => cutoff.floor === floor)?.value ?? null
}

/**
 * Splits a spread's min→max range into parse-tier bands. Each band runs from
 * the weakest value reaching its tier to where the next reached tier starts.
 */
export function spreadBands(spread: ParseScoreSpread): SpreadBand[] {
  const starts = [{ floor: 0, value: spread.min as number | null }, ...spread.cutoffs.map((c) => ({ floor: c.floor, value: c.value }))]
    .filter((s): s is { floor: number; value: number } => s.value !== null)
    .sort((a, b) => a.floor - b.floor)
  return starts
    .map((start, i) => ({ floor: start.floor, start: start.value, end: starts[i + 1]?.value ?? spread.max }))
    .filter((band) => band.end > band.start)
}

/** Label for a spread row: spec, plus sub-spec when it has one. */
export function spreadSpecLabel(spread: Pick<ParseScoreSpread, "player_spec" | "player_sub_spec">): string {
  const spec = spread.player_spec ?? ""
  return spread.player_sub_spec ? `${spec} (${spread.player_sub_spec})` : spec
}

export interface SpreadDifficultyOption {
  key: string
  difficultyName: string
  maxPlayers: number
  sampleSize: number
}

/** Difficulty/size combos present in spreads, most kills first. */
export function spreadDifficulties(spreads: readonly ParseScoreSpread[]): SpreadDifficultyOption[] {
  const options = new Map<string, SpreadDifficultyOption>()
  for (const spread of spreads) {
    const key = `${spread.difficulty_name}|${spread.max_players}`
    const option = options.get(key) ?? { key, difficultyName: spread.difficulty_name, maxPlayers: spread.max_players, sampleSize: 0 }
    option.sampleSize += spread.sample_size
    options.set(key, option)
  }
  return [...options.values()].sort((a, b) => b.sampleSize - a.sampleSize)
}

/**
 * Picks the requested difficulty/size, else the busiest option with the
 * requested difficulty name, else the busiest option overall.
 */
export function selectSpreadDifficulty(
  options: readonly SpreadDifficultyOption[],
  difficultyName: string,
  maxPlayers: string,
): SpreadDifficultyOption | undefined {
  return (
    options.find((o) => o.difficultyName === difficultyName && String(o.maxPlayers) === maxPlayers) ??
    options.find((o) => o.difficultyName === difficultyName) ??
    options[0]
  )
}

/** Class → spec → sub-spec options present in a set of spreads. */
export function classSpecOptions(spreads: readonly ParseScoreSpread[]): RankingsFilterClass[] {
  const byClass = new Map<string, Map<string, Set<string>>>()
  for (const spread of spreads) {
    const specs = byClass.get(spread.player_class) ?? new Map<string, Set<string>>()
    byClass.set(spread.player_class, specs)
    const subSpecs = specs.get(spread.player_spec ?? "") ?? new Set<string>()
    specs.set(spread.player_spec ?? "", subSpecs)
    if (spread.player_sub_spec) subSpecs.add(spread.player_sub_spec)
  }
  return [...byClass.entries()].map(([playerClass, specs]) => ({
    player_class: playerClass,
    specs: [...specs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([spec, subSpecs]) => ({ spec, sub_specs: [...subSpecs].sort() })),
  }))
}

export interface SpreadScale {
  min: number
  max: number
  ticks: number[]
}

/**
 * Shared axis for spread rows. Bars encode position, not length, so the
 * axis starts just below the lowest 25th-percentile cutoff instead of zero;
 * the long 0–24 tails (deaths, late joins) are clipped at the left edge.
 */
export function spreadScale(spreads: readonly ParseScoreSpread[], targetTicks = 6): SpreadScale {
  if (spreads.length === 0) return { min: 0, max: 1, ticks: [0, 1] }
  const lo = Math.min(...spreads.map((s) => spreadCutoff(s, 25) ?? s.min))
  const hi = Math.max(...spreads.map((s) => s.max))
  const step = niceStep(Math.max(hi - lo * 0.9, 1) / targetTicks, false)
  const min = Math.max(0, Math.floor((lo * 0.9) / step) * step)
  const max = Math.max(min + step, Math.ceil(hi / step) * step)
  const ticks: number[] = []
  for (let tick = min; tick <= max + step / 2; tick += step) ticks.push(tick)
  return { min, max, ticks }
}
