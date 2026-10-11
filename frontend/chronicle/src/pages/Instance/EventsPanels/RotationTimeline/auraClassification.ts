/**
 * Which aura rows a rotation view shows, from the spell's class set and the
 * curated class-buff list. See docs/player-timeline-page.md.
 */

export type AuraPlacement = "key" | "other";

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
  if (!spellClassSet || spellClassSet === "Unknown" || adminIgnored) return "other";
  const owner = normalizeClass(spellClassSet);
  // Other classes' buffs (Mark of the Wild on a rogue) stay out of the key rows.
  return owner === "generic" || owner === normalizeClass(playerClass) ? "key" : "other";
}

/** Combine per-player placements for one row: key if it is key for any player. */
export function combinePlacements(placements: readonly AuraPlacement[]): AuraPlacement {
  return placements.includes("key") ? "key" : "other";
}
