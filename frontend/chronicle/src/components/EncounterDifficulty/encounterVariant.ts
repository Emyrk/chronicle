/** Encounter variants are independent of raid difficulty and size. Only proven classifications belong here. */
export type EncounterVariant = "normal" | "medium" | "hard" | "lights_0" | "lights_1" | "lights_2" | "lights_3" | "lights_4";
export type EncounterVariants = Record<string, EncounterVariant>;

export function supportsEncounterVariant(instance: string, boss: string): boolean {
  return instance === "Ulduar" && (boss === "Assembly of Iron" || boss === "Hodir" || boss === "XT-002 Deconstructor" || boss === "General Vezax" || boss === "Yogg-Saron");
}

export function encounterVariantLabel(variant: EncounterVariant): string {
  return variant.startsWith("lights_") ? `${variant.slice(-1)} Light` : variant === "normal" ? "Normal" : variant === "medium" ? "Medium mode" : "Hard mode";
}

/** Highest tier currently backed by classification and published ratings. */
export function highestEncounterVariant(instance: string, boss: string): EncounterVariant | undefined {
  return supportsEncounterVariant(instance, boss) ? boss === "Yogg-Saron" ? "lights_0" : "hard" : undefined;
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
  const entries = Object.entries(variants ?? {}).filter(([boss, variant]) => bosses.includes(boss) && supportsEncounterVariant(instance, boss) && encounterVariantOptions(boss).includes(variant)).sort(([a], [b]) => a.localeCompare(b));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function encounterVariantsEnabled(tab: string, ratingView: string): boolean {
  return tab === "performances" || tab === "statistics" || (tab === "ratings" && ratingView !== "overview");
}

export function encounterVariantOptions(boss: string): readonly EncounterVariant[] {
  // Assembly of Iron tiers follow the last surviving member: Stormcaller Brundir (normal), Runemaster Molgeim (medium), Steelbreaker (hard).
  if (boss === "Assembly of Iron") return ["normal", "medium", "hard"];
  return boss === "Yogg-Saron" ? ["lights_0", "lights_1", "lights_2", "lights_3", "lights_4"] : ["normal", "hard"];
}

export function isEncounterVariant(value?: string): value is EncounterVariant {
  return value !== undefined && ["normal", "medium", "hard", "lights_0", "lights_1", "lights_2", "lights_3", "lights_4"].includes(value);
}

export function isHardEncounterVariant(variant: EncounterVariant): boolean {
  return variant === "hard" || variant === "lights_0" || variant === "lights_1";
}
