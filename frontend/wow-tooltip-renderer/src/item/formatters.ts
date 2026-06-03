import type { ItemDamage } from "../types.js";
import { SPELL_TRIGGER_TEXT, STAT_DISPLAY } from "./constants.js";

export interface FormattedStat {
  /** The display text, e.g. "+20 Strength" or "Equip: Improves haste rating by 14." */
  text: string;
  /** True for green combat-rating lines, false for white base attributes. */
  green: boolean;
}

/**
 * Format an item stat (type + value) into its tooltip line. Unknown stat types
 * fall back to a diagnostic label.
 */
export function formatItemStat(statType: number, value: number): FormattedStat {
  const display = STAT_DISPLAY[statType];
  if (!display) {
    return { text: `+${value} Unknown Stat ${statType}`, green: false };
  }
  return { text: display.format(value), green: display.green };
}

/**
 * Compute weapon DPS from a damage range and swing delay.
 * @param damage Primary damage range (min/max).
 * @param delayMs Weapon swing speed in milliseconds.
 * @returns DPS, or null when inputs are missing/invalid.
 */
export function calculateDPS(
  damage: Pick<ItemDamage, "min" | "max"> | undefined,
  delayMs: number | undefined,
): number | null {
  if (!damage || !delayMs || delayMs <= 0) return null;
  return ((damage.min + damage.max) / 2) / (delayMs / 1000);
}

/** "Use:" / "Equip:" / "Chance on hit:" prefix for an item spell trigger. */
export function spellTriggerText(trigger: number): string {
  return SPELL_TRIGGER_TEXT[trigger] ?? "Use:";
}
