import { describe, expect, it } from "vitest"
import { cohortLabel, normalizePlayerCountDifficulty } from "./cohortLabel"

describe("normalizePlayerCountDifficulty", () => {
  it.each([
    ["10 игроков", 10, "10 Player"],
    ["25 joueurs", 25, "25 Player"],
    ["10 Player", 10, "10 Player"],
  ])("normalizes %s", (difficulty, maxPlayers, expected) => {
    expect(normalizePlayerCountDifficulty(difficulty, maxPlayers)).toBe(expected)
  })

  it("preserves qualified and mismatched difficulty names", () => {
    expect(normalizePlayerCountDifficulty("10 игроков (героич.)", 10)).toBe("10 игроков (героич.)")
    expect(normalizePlayerCountDifficulty("10 игроков", 25)).toBe("10 игроков")
    expect(normalizePlayerCountDifficulty("Heroic", 10)).toBe("Heroic")
  })
})

describe("cohortLabel", () => {
  it("shows localized player-count cohorts in English", () => {
    expect(cohortLabel({ difficulty_name: "10 игроков", max_players: 10 })).toBe("10 Player")
  })
})
