/**
 * What the leaderboards are scoped to, as on /leaderboards.
 *
 * - `clear`: the instance's preset (its default bosses, the state on entry).
 *   Ratings are the raid's own and Speedruns opens on full clears.
 * - `bosses`: a hand-picked set (Click picks one, Ctrl+Click adds or removes).
 *   Ratings average (Renown sums) over the chosen bosses, a missed one as 0.
 */
export type EncounterSelection = { kind: "clear" } | { kind: "bosses"; bosses: string[] }

export const FULL_CLEAR: EncounterSelection = { kind: "clear" }

/** The bosses a selection stands for; the preset is every listed boss but trash. */
export function selectedBosses(selection: EncounterSelection, preset: readonly string[]): string[] {
  return selection.kind === "bosses" ? selection.bosses : [...preset]
}

/**
 * Click picks one boss; Ctrl+Click adds or removes one from what is shown. A set
 * equal to the preset (or emptied) goes back to the preset.
 */
export function toggleEncounter(selection: EncounterSelection, preset: readonly string[], order: readonly string[], boss: string, combine: boolean): EncounterSelection {
  if (!combine) return { kind: "bosses", bosses: [boss] }
  const next = new Set(selectedBosses(selection, preset))
  if (next.has(boss)) next.delete(boss)
  else next.add(boss)
  // Keep raid order so titles and boards read top to bottom.
  const ordered = order.filter((b) => next.has(b))
  const isPreset = ordered.length === preset.length && preset.every((b) => next.has(b))
  return !ordered.length || isPreset ? FULL_CLEAR : { kind: "bosses", bosses: ordered }
}
