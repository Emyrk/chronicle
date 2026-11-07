import type { RankingEncounterSet } from "@/api/typesGenerated"
import { resolveRankingEncounterSet } from "@/pages/Rankings/rankingEncounterSets"

/** Offer every configured encounter set, with the default roster first, not historical
 * encounter rows (which can include bosses removed by a server flavor).
 * Trash is a performance encounter only, never a raid boss or default choice.
 */
export function liveHubBosses(recorded: readonly string[], progression?: ReadonlySet<string>,
  rankingSets: readonly RankingEncounterSet[] = [], performances = false): string[] {
  const configured = resolveRankingEncounterSet(rankingSets, "")?.encounters
  const canonical = rankingSets.length
    ? [...(configured ?? []), ...rankingSets.flatMap((set) => set.encounters)]
    : progression
  const names = canonical ? [...canonical].filter((name) => name !== "Trash") : recorded.filter((name) => name !== "Trash")
  const bosses = [...new Set(names)]
  if (performances && recorded.includes("Trash")) bosses.push("Trash")
  return bosses
}
