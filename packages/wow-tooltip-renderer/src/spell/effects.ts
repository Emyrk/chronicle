import type { WoWSpell } from "../types.js";

/**
 * Format a duration in milliseconds to a human-readable string. Used for $d.
 */
export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0 sec";
  const seconds = ms / 1000;
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (mins === 0) return `${hours} hour${hours !== 1 ? "s" : ""}`;
    return `${hours} hour${hours !== 1 ? "s" : ""} ${mins} min`;
  }
  if (seconds >= 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (secs === 0) return `${mins} min`;
    return `${mins} min ${secs} sec`;
  }
  // Show decimal for short durations
  if (seconds < 10 && seconds !== Math.floor(seconds)) {
    return `${seconds.toFixed(1)} sec`;
  }
  return `${Math.floor(seconds)} sec`;
}

/**
 * Compute the effective caster level for scaling calculations.
 * lvl = min(maxLevel, forLevel) - max(baseLevel, spellLevel), clamped to >= 0.
 */
export function getEffectiveLevel(spell: WoWSpell, forLevel: number): number {
  const maxLvl = spell.max_level || forLevel;
  return Math.max(
    0,
    Math.min(maxLvl, forLevel) - Math.max(spell.base_level, spell.spell_level),
  );
}

/**
 * Get the scaled effect value(s) for a given effect slot.
 * Returns [value] for fixed values, or [min, max] for die roll ranges.
 *
 * Follows the WoW Spell DBC die roll formula:
 *   minDieRoll = baseDice + dicePerLevel * lvl
 *   maxDieRoll = dieSides * (baseDice + dicePerLevel * lvl)
 *   effectValue = basePoints + dieRoll + realPointsPerLevel * lvl
 */
export function getScaledValue(
  spell: WoWSpell,
  index: number,
  forLevel: number,
  op?: (n: number) => number,
): number[] {
  if (index < 0 || index >= 3) return [0];
  const base = spell.effect_base_points[index] ?? 0;
  const baseDice = spell.effect_base_dice[index] ?? 0;
  const dieSides = spell.effect_die_sides[index] ?? 0;
  const dicePerLevel = spell.effect_dice_per_level[index] ?? 0;
  const realPPL = spell.effect_real_points_per_level[index] ?? 0;

  const lvl = getEffectiveLevel(spell, forLevel);
  const diceCount = baseDice + dicePerLevel * lvl;
  const min = diceCount;
  const max = dieSides * diceCount;
  const scaling = realPPL * lvl;

  const applyOp = (n: number) => {
    const abs = Math.abs(n);
    return op ? op(abs) : abs;
  };

  return max > min
    ? [applyOp(base + min + scaling), applyOp(base + max + scaling)]
    : [applyOp(base + min + scaling)];
}

/**
 * Get the total periodic value(s) over the spell's duration.
 * Returns [value] or [min, max] scaled by tick count.
 */
export function getPeriodicTotal(
  spell: WoWSpell,
  index: number,
  forLevel: number,
  op?: (n: number) => number,
): number[] {
  if (index < 0 || index >= 3) return [0];
  const values = getScaledValue(spell, index, forLevel, op);
  const amplitude = spell.effect_aura_period[index] ?? 0;
  const duration = spell.duration.Duration ?? 0;
  if (amplitude <= 0 || duration <= 0) return values;
  const ticks = duration / amplitude;
  return values.map((v) => v * ticks);
}

/**
 * Format a scaled value array as a string.
 * Single values: "100". Ranges: "14 to 22".
 */
export function formatValue(values: number[], floating?: boolean): string {
  const fmt = (n: number) =>
    floating ? n.toFixed(1).replace(/\.0$/, "") : String(Math.floor(n));
  return values.map(fmt).join(" to ");
}
