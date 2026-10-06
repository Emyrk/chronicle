import type { RankingEncounterSet } from "@/api/typesGenerated"

export function resolveRankingEncounterSet(
  sets: readonly RankingEncounterSet[],
  requestedID: string,
): RankingEncounterSet | undefined {
  return sets.find((set) => set.id === requestedID)
    ?? sets.find((set) => set.id === "")
    ?? sets[0]
}
