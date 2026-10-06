import { describe, expect, it } from "vitest"
import type { RankingEncounterSet } from "@/api/typesGenerated"
import { resolveRankingEncounterSet } from "./rankingEncounterSets"

const sets: readonly RankingEncounterSet[] = [
  { id: "", label: "Normal", encounters: ["Erennius", "Solnius"] },
  { id: "hard", label: "Hard Mode", encounters: ["Solnius (Hard Mode)"] },
]

describe("resolveRankingEncounterSet", () => {
  it("selects a named set", () => {
    expect(resolveRankingEncounterSet(sets, "hard")?.encounters).toEqual(["Solnius (Hard Mode)"])
  })

  it("falls back to the empty-ID default", () => {
    expect(resolveRankingEncounterSet(sets, "missing")?.encounters).toEqual(["Erennius", "Solnius"])
  })

  it("returns undefined when no sets are configured", () => {
    expect(resolveRankingEncounterSet([], "")).toBeUndefined()
  })
})
