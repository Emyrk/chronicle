import type { RankingEncounterSet } from "@/api/typesGenerated"
import { resolveRankingEncounterSet } from "@/pages/Rankings/rankingEncounterSets"

/** The default clear selection follows the configured default encounter set. */
export function liveHubPreset(recorded: readonly string[], progression?: ReadonlySet<string>,
  rankingSets: readonly RankingEncounterSet[] = []): string[] {
  const canonical = resolveRankingEncounterSet(rankingSets, "")?.encounters ?? progression ?? recorded
  return [...new Set([...canonical].filter((name) => name !== "Trash"))]
}

/** Offer every configured encounter set, with the default roster first, not historical
 * encounter rows (which can include bosses removed by a server flavor).
 * Trash is a performance encounter only, never a raid boss or default choice.
 */
export function liveHubBosses(recorded: readonly string[], progression?: ReadonlySet<string>,
  rankingSets: readonly RankingEncounterSet[] = [], performances = false): string[] {
  const preset = liveHubPreset(recorded, progression, rankingSets)
  const setBosses = rankingSets.flatMap((set) => set.encounters)
  // Renown-only raids may intentionally have an enabled but empty default set.
  // Their configured boss roster is still the encounter picker roster.
  const canonical = rankingSets.length
    ? [...preset, ...(setBosses.length ? setBosses : recorded)]
    : preset
  const bosses = [...new Set(canonical.filter((name) => name !== "Trash"))]
  if (performances && recorded.includes("Trash")) bosses.push("Trash")
  return bosses
}
