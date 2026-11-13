/** Encounter variants are independent of raid difficulty and size. Only proven classifications belong here. */
export type EncounterVariant = "normal" | "hard";
export type EncounterVariants = Record<string, EncounterVariant>;

export function supportsEncounterVariant(instance: string, boss: string): boolean {
  return instance === "Ulduar" && boss === "Hodir";
}

export function encounterVariantLabel(variant: EncounterVariant): string {
  return variant === "normal" ? "Normal" : "Hard mode";
}

/** Highest tier currently backed by classification and published ratings. */
export function highestEncounterVariant(instance: string, boss: string): EncounterVariant | undefined {
  return supportsEncounterVariant(instance, boss) ? "hard" : undefined;
}

/** Preserve other per-boss choices and never change the encounter selection. */
export function withHighestEncounterVariants(instance: string, bosses: readonly string[], current: EncounterVariants = {}, clear = false): EncounterVariants {
  const next = { ...current };
  for (const boss of bosses) {
    const highest = highestEncounterVariant(instance, boss);
    if (!highest) continue;
    if (clear) delete next[boss];
    else next[boss] = highest;
  }
  return next;
}

export function activeEncounterVariants(instance: string, bosses: readonly string[], variants?: EncounterVariants): EncounterVariants | undefined {
  const entries = Object.entries(variants ?? {}).filter(([boss]) => bosses.includes(boss) && supportsEncounterVariant(instance, boss)).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function encounterVariantsEnabled(tab: string, ratingView: string): boolean {
  return tab === "performances" || tab === "statistics" || (tab === "ratings" && ratingView !== "overview");
}
