import { getLocalizedText, type LocaleIndex, type WoWSpell } from "@/api/wowdb";

const PLAYER_LEVEL_VARIABLE = /\$PL\b/i;

export function spellUsesPlayerLevel(
  spell: WoWSpell,
  locale: LocaleIndex = "0",
): boolean {
  return [
    getLocalizedText(spell.description, locale),
    getLocalizedText(spell.aura_description, locale),
    spell.description_variables ?? "",
  ].some((text) => PLAYER_LEVEL_VARIABLE.test(text));
}

export function spellLevelCapForFlavor(flavor: readonly string[]): number {
  if (flavor.includes("wrath")) return 80;
  if (flavor.includes("tbc")) return 70;
  return 60;
}

export function parseSpellPlayerLevel(
  value: string | null,
  maxLevel: number,
): number {
  if (value === null || value.trim() === "") return maxLevel;
  const level = Number(value);
  if (!Number.isInteger(level)) return maxLevel;
  return Math.min(Math.max(level, 1), maxLevel);
}
