import type { WoWSpell } from "../types.js";
import {
  formatDurationMs,
  formatValue,
  getPeriodicTotal,
  getScaledValue,
} from "./effects.js";

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

  // Duration: $d
  if (variable === "$d") {
    return formatDurationMs(spell.duration.Duration);
  }

  // Indexed variables: $X# where X is a letter and # is 1, 2, or 3
  const indexedMatch = variable.match(/^\$([a-zA-Z])(\d)$/);
  if (indexedMatch) {
    const type = indexedMatch[1].toLowerCase();
    const index = parseInt(indexedMatch[2], 10) - 1; // 1-indexed -> 0-indexed

    switch (type) {
      case "s": // Effect value (base + die range)
      case "m": // Modified effect value (same as $s for our purposes)
        return formatValue(getScaledValue(spell, index, lvl));

      case "o": // Total over duration
        return formatValue(getPeriodicTotal(spell, index, lvl));

      case "t": {
        // Tick interval in seconds
        const period = spell.effect_aura_period[index] ?? 0;
        return period > 0 ? String(Math.round(period / 1000)) : "0";
      }

      case "a": {
        // AOE radius
        const radius = spell.effect_radius[index];
        return radius ? String(radius.Radius) : "0";
      }

      case "e": // Effect amplitude/proc value
        return String(spell.effect_amplitude[index] ?? 0);

      case "x": // Chain targets
        return String(spell.effect_chain_targets[index] ?? 0);

      case "b": // Points per combo point
        return String(spell.effect_points_per_combo[index] ?? 0);

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
    case "$s": // Effect value (base + die range)
    case "$m": // Modified effect value (same as $s for our purposes)
      return formatValue(getScaledValue(spell, 0, lvl));

    case "$o": // Total over duration
      return formatValue(getPeriodicTotal(spell, 0, lvl));

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

    case "$t": {
      // Tick interval without index defaults to effect 1
      const period = spell.effect_aura_period[0] ?? 0;
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
