import { describe, expect, it } from "vitest"
import type { ParseScoreSpread } from "@/api/typesGenerated"
import {
  difficultyLabel,
  offRoleKeys,
  relativeTickLabel,
  relativeTimeScale,
  selectSpreadDifficulty,
  spreadBands,
  spreadDifficulties,
  spreadScale,
  timeBands,
} from "./spreadBands"

function spread(cutoffs: Record<number, number | null>): ParseScoreSpread {
  return {
    encounter_name: "Ragnaros",
    difficulty_name: "Normal",
    max_players: 40,
    player_class: "MAGE",
    sample_size: 100,
    status: "ok",
    min: 100,
    median: 500,
    max: 1000,
    cutoffs: Object.entries(cutoffs).map(([floor, value]) => ({ floor: Number(floor), value })),
  }
}

describe("spreadBands", () => {
  it("splits the range at each tier cutoff", () => {
    expect(spreadBands(spread({ 25: 300, 50: 500, 75: 700, 95: 900, 99: 950, 100: 1000 }))).toEqual([
      { floor: 0, start: 100, end: 300 },
      { floor: 25, start: 300, end: 500 },
      { floor: 50, start: 500, end: 700 },
      { floor: 75, start: 700, end: 900 },
      { floor: 95, start: 900, end: 950 },
      { floor: 99, start: 950, end: 1000 },
    ])
  })

  it("skips tiers nobody reached", () => {
    expect(spreadBands(spread({ 25: 300, 50: 500, 75: null, 95: null, 99: null, 100: null }))).toEqual([
      { floor: 0, start: 100, end: 300 },
      { floor: 25, start: 300, end: 500 },
      { floor: 50, start: 500, end: 1000 },
    ])
  })
})

describe("selectSpreadDifficulty", () => {
  const options = spreadDifficulties([
    { ...spread({}), difficulty_name: "Normal", max_players: 40, sample_size: 50 },
    { ...spread({}), difficulty_name: "Normal", max_players: 40, sample_size: 50 },
    { ...spread({}), difficulty_name: "Normal", max_players: 20, sample_size: 30 },
    { ...spread({}), difficulty_name: "Heroic", max_players: 40, sample_size: 80 },
  ])

  it("orders by total kills", () => {
    expect(options.map((o) => [o.key, o.sampleSize])).toEqual([["Normal|40", 100], ["Heroic|40", 80], ["Normal|20", 30]])
  })

  it("prefers the exact request, then the difficulty name, then the busiest", () => {
    expect(selectSpreadDifficulty(options, "Normal", "20")?.key).toBe("Normal|20")
    expect(selectSpreadDifficulty(options, "Heroic", "")?.key).toBe("Heroic|40")
    expect(selectSpreadDifficulty(options, "Mythic", "")?.key).toBe("Normal|40")
  })
})

describe("spreadScale", () => {
  it("starts just below the weakest 25+ cutoff", () => {
    const scale = spreadScale([spread({ 25: 300, 50: 500, 75: 700, 95: 900, 99: 950, 100: 1000 })])
    expect(scale.min).toBeGreaterThan(0)
    expect(scale.min).toBeLessThanOrEqual(270)
    expect(scale.max).toBeGreaterThanOrEqual(1000)
    expect(scale.ticks[0]).toBe(scale.min)
    expect(scale.ticks.at(-1)).toBe(scale.max)
  })
})

describe("offRoleKeys", () => {
  it("flags rows far below the best median", () => {
    const rows = [
      { ...spread({}), player_spec: "Combat", median: 750 },
      { ...spread({}), player_spec: "Protection", median: 190 },
      { ...spread({}), player_spec: "Holy", median: 14 },
      { ...spread({}), player_spec: "Fire", median: 5000, status: "sample_too_small" },
    ]
    expect([...offRoleKeys(rows, (s) => s.player_spec ?? "")]).toEqual(["Holy"])
  })
})

describe("difficultyLabel", () => {
  it("avoids repeating the size", () => {
    expect(difficultyLabel("", 0)).toBe("")
    expect(difficultyLabel("40 Player", 40)).toBe("40 Player")
    expect(difficultyLabel("Heroic", 25)).toBe("Heroic · 25 Player")
  })
})

describe("timeBands", () => {
  it("runs from the fastest kill through each tier to the slowest", () => {
    const spread = {
      kind: "boss_kill" as const,
      difficulty_name: "",
      max_players: 0,
      sample_size: 50,
      status: "ok",
      min_ms: 40_000,
      median_ms: 70_000,
      max_ms: 150_000,
      cutoffs: [
        { floor: 25, duration_ms: 90_000 },
        { floor: 50, duration_ms: 70_000 },
        { floor: 75, duration_ms: 60_000 },
        { floor: 95, duration_ms: 50_000 },
        { floor: 99, duration_ms: 45_000 },
        { floor: 100, duration_ms: null },
      ],
    }
    expect(timeBands(spread)).toEqual([
      { floor: 99, start: 40_000, end: 45_000 },
      { floor: 95, start: 45_000, end: 50_000 },
      { floor: 75, start: 50_000, end: 60_000 },
      { floor: 50, start: 60_000, end: 70_000 },
      { floor: 25, start: 70_000, end: 90_000 },
      { floor: 0, start: 90_000, end: 150_000 },
    ])
  })
})

describe("relativeTimeScale", () => {
  const base = { kind: "boss_kill" as const, difficulty_name: "", max_players: 0, sample_size: 50, status: "ok" }
  it("spans every row relative to its median", () => {
    const scale = relativeTimeScale([
      { ...base, min_ms: 30_000, median_ms: 60_000, max_ms: 300_000, cutoffs: [{ floor: 25, duration_ms: 75_000 }] },
      { ...base, min_ms: 3_000_000, median_ms: 4_000_000, max_ms: 9_000_000, cutoffs: [{ floor: 25, duration_ms: 5_000_000 }] },
    ])
    expect(scale.min).toBeLessThanOrEqual(0.5)
    expect(scale.max).toBeGreaterThanOrEqual(1.25 * 1.1)
    expect(scale.max).toBeLessThan(2)
    expect(scale.ticks).toContain(1)
  })

  it("labels ticks against the median", () => {
    expect(relativeTickLabel(1)).toBe("median")
    expect(relativeTickLabel(0.6)).toBe("−40%")
    expect(relativeTickLabel(1.2)).toBe("+20%")
  })
})
