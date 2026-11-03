import type { RankingEncounterSet } from "@/api/typesGenerated"
import { resolveRankingEncounterSet } from "@/pages/Rankings/rankingEncounterSets"

/** Use the same configured default roster as /leaderboards, not historical
 * encounter rows (which can include bosses removed by a server flavor).
 * Trash is a performance encounter only, never a raid boss or default choice.
 */
export function liveHubBosses(recorded: readonly string[], progression?: ReadonlySet<string>,
  rankingSets: readonly RankingEncounterSet[] = [], performances = false): string[] {
  const configured = resolveRankingEncounterSet(rankingSets, "")?.encounters
  const canonical = configured?.length ? configured : progression
  const names = canonical ? [...canonical].filter((name) => name !== "Trash") : recorded.filter((name) => name !== "Trash")
  const bosses = [...new Set(names)]
  if (performances && recorded.includes("Trash")) bosses.push("Trash")
  return bosses
}
