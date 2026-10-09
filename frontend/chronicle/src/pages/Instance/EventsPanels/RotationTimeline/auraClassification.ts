/**
 * Which aura rows a rotation view shows, from the spell's class set and the
 * curated class-buff list. See docs/player-timeline-page.md.
 */

export type AuraPlacement = "key" | "other" | "hidden";

/** "Death Knight" / "DeathKnight" / "DEATHKNIGHT" → "deathknight" */
export function normalizeClass(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * @param spellClassSet the spell's class set name ("Generic", "Rogue", ...), or
 *   undefined when spell metadata is not loaded or missing.
 * @param playerClass the class of the player the aura is on (or cast by).
 * @param adminIgnored an admin explicitly ignored this spell in the curated list.
 */
export function classifyAura(spellClassSet: string | undefined, playerClass: string, adminIgnored: boolean): AuraPlacement {
  if (!spellClassSet || spellClassSet === "Unknown") return "other";
  const owner = normalizeClass(spellClassSet);
  if (owner !== "generic" && owner !== normalizeClass(playerClass)) return "hidden";
  return adminIgnored ? "other" : "key";
}

/**
 * Combine per-player placements for one row. A row is hidden only when it is
 * hidden for every player who has it; otherwise the most prominent wins.
 */
export function combinePlacements(placements: readonly AuraPlacement[]): AuraPlacement {
  if (placements.includes("key")) return "key";
  if (placements.includes("other")) return "other";
  return "hidden";
}
