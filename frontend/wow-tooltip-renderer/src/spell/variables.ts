import type { WoWSpell } from "../types.js";
import {
  formatDurationMs,
  formatValue,
  getPeriodicTotal,
  getScaledValue,
} from "./effects.js";
import { getTooltipEffect, hasExactBasePoints } from "./components.js";

/**
 * Resolve a single template variable (e.g. "$s1", "$d", "$n") against a spell's
 * effect data. Returns the original variable string unchanged when it cannot be
 * resolved (runtime-only variables, unknown types), which keeps the placeholder
 * visible for diagnosis.
 *
 * @param forLevel Caster level for scaling calculations (defaults to spell level)
 */
export function resolveVariable(
  spell: WoWSpell,
  variable: string,
  forLevel?: number,
): string {
  const lvl = forLevel ?? spell.spell_level;
  const normalizedVariable = variable.toLowerCase();

  // Static tooltips have no character stat context. Treat attack power and bonus
  // healing as zero, while preserving coefficients and player-level scaling so
  // expressions can still render their base values instead of leaking raw formulas.
  if (normalizedVariable === "$ap" || normalizedVariable === "$bh") return "0";
  if (normalizedVariable === "$pl") return String(lvl);
  if (normalizedVariable === "$bc") {
    return String(getTooltipEffect(spell, 0)?.effect_bonus_coefficient ?? 0);
  }

  // Duration: $d
  if (variable === "$d") {
    return formatDurationMs(spell.duration.Duration);
  }

  // Indexed variables: $X# where X is a letter and # is a 1-based effect index.
  const indexedMatch = variable.match(/^\$([a-zA-Z])(\d+)$/);
  if (indexedMatch) {
    const rawType = indexedMatch[1];
    const type = rawType.toLowerCase();
    const index = parseInt(indexedMatch[2], 10) - 1; // 1-indexed -> 0-indexed

    switch (type) {
      case "s": // Effect value (base + die/variance range)
        return formatValue(
          getScaledValue(spell, index, lvl),
          hasExactBasePoints(spell, index),
        );

      case "m": { // Minimum ($m) or maximum ($M) effect value
        const values = getScaledValue(spell, index, lvl);
        const value = rawType === "M" ? values[values.length - 1] : values[0];
        return formatValue([value], hasExactBasePoints(spell, index));
      }

      case "o": // Total over duration
        return formatValue(
          getPeriodicTotal(spell, index, lvl),
          hasExactBasePoints(spell, index),
        );

      case "t": {
        // Tick interval in seconds
        const period = getTooltipEffect(spell, index)?.effect_aura_period ?? 0;
        return period > 0 ? String(Math.round(period / 1000)) : "0";
      }

      case "a": {
        // AOE radius
        const radius = getTooltipEffect(spell, index)?.effect_radius;
        return radius ? String(radius.Radius) : "0";
      }

      case "e": // Effect amplitude/proc value
        return String(getTooltipEffect(spell, index)?.effect_amplitude ?? 0);

      case "x": // Chain targets
        return String(
          getTooltipEffect(spell, index)?.effect_chain_targets ?? 0,
        );

      case "b": // Points per combo point
        return String(
          getTooltipEffect(spell, index)?.effect_points_per_combo ?? 0,
        );

      case "d": // Duration (spell-level, index ignored)
        return formatDurationMs(spell.duration.Duration);

      case "f": // Max stacks (not always per-effect, but sometimes used)
        return String(spell.cumulative_aura || 0);

      case "h": // Proc chance (spell-level, index ignored)
        return String(spell.proc_chance || 0);

      case "n": // Proc charges (spell-level, index ignored)
        return String(spell.proc_charges || 1);
    }
  }

  // Non-indexed variables. Effect variables without an explicit slot use effect 1.
  switch (variable) {
    case "$s": // Effect value (base + die/variance range)
      return formatValue(
        getScaledValue(spell, 0, lvl),
        hasExactBasePoints(spell, 0),
      );

    case "$m":
    case "$M": { // Minimum ($m) or maximum ($M) effect value
      const values = getScaledValue(spell, 0, lvl);
      const value = variable === "$M" ? values[values.length - 1] : values[0];
      return formatValue([value], hasExactBasePoints(spell, 0));
    }

    case "$o": // Total over duration
      return formatValue(
        getPeriodicTotal(spell, 0, lvl),
        hasExactBasePoints(spell, 0),
      );

    case "$n": // Proc charges / stacks
      return String(spell.proc_charges || 1);

    case "$h": // Proc chance
      return String(spell.proc_chance || 0);

    case "$r": // Range
      return String(spell.range.RangeMax || 0);

    case "$u": // Max stacks / cumulative aura
      return String(spell.cumulative_aura || 0);

    case "$v": // Max target level
      return String(spell.max_target_level || 0);

    case "$i": // Maximum number of affected targets
      return String(spell.max_targets || 0);

    case "$t": {
      // Tick interval without index defaults to effect 1
      const period = getTooltipEffect(spell, 0)?.effect_aura_period ?? 0;
      return period > 0 ? String(Math.round(period / 1000)) : "0";
    }

    case "$z": // Home location (runtime, not available)
      return "[Home]";

    case "$c": // Caster (runtime)
      return "the caster";

    // $l is NOT "level" — it is pluralization ($lsingular:plural;) handled by
    // the resolver. If we get here with a bare $l, return it unchanged.
    case "$l":
      return variable;

    default:
      // Return the original variable if we can't resolve it
      return variable;
  }
}
