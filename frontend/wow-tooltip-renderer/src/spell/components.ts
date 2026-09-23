import type { SpellEffect, SpellPower, WoWSpell } from "../types.js";

const EMPTY_ENUM = { value: 0, string: "None" };
const EMPTY_RADIUS = {
  ID: 0,
  Radius: 0,
  RadiusPerLevel: 0,
  RadiusMin: 0,
  RadiusMax: 0,
};

/** Select a difficulty-zero effect by its explicit effect index. */
export function getDefaultEffect(
  spell: WoWSpell,
  effectIndex: number,
): SpellEffect | undefined {
  return spell.effects?.find(
    (effect) =>
      (effect.difficulty_id ?? 0) === 0 && effect.effect_index === effectIndex,
  );
}

/**
 * Project one legacy effect slot into the canonical shape.
 *
 * This is only used for older clients whose payload predates `effects`. It is
 * intentionally limited to the three legacy slots.
 */
export function getLegacyEffectProjection(
  spell: WoWSpell,
  effectIndex: number,
): SpellEffect | undefined {
  if (effectIndex < 0 || effectIndex >= 3) return undefined;

  return {
    difficulty_id: 0,
    effect_index: effectIndex,
    effect: spell.effect[effectIndex] ?? EMPTY_ENUM,
    effect_die_sides: spell.effect_die_sides[effectIndex] ?? 0,
    effect_real_points_per_level:
      spell.effect_real_points_per_level[effectIndex] ?? 0,
    effect_base_points: spell.effect_base_points[effectIndex] ?? 0,
    effect_base_points_f: spell.effect_base_points_f?.[effectIndex],
    effect_radius: spell.effect_radius[effectIndex] ?? EMPTY_RADIUS,
    effect_aura_period: spell.effect_aura_period[effectIndex] ?? 0,
    effect_amplitude: spell.effect_amplitude[effectIndex] ?? 0,
    effect_chain_targets: spell.effect_chain_targets[effectIndex] ?? 0,
    effect_points_per_combo: spell.effect_points_per_combo[effectIndex] ?? 0,
    effect_base_dice: spell.effect_base_dice[effectIndex] ?? 0,
    effect_dice_per_level: spell.effect_dice_per_level[effectIndex] ?? 0,
  };
}

/**
 * Select the default effect, falling back to the named legacy projection only
 * when the canonical collection is absent from an older payload.
 */
export function getTooltipEffect(
  spell: WoWSpell,
  effectIndex: number,
): SpellEffect | undefined {
  if (spell.effects !== undefined) {
    return getDefaultEffect(spell, effectIndex);
  }
  return getLegacyEffectProjection(spell, effectIndex);
}

/** Return whether the selected effect carries an exact modern base-point value. */
export function hasExactBasePoints(
  spell: WoWSpell,
  effectIndex: number,
): boolean {
  return (
    getTooltipEffect(spell, effectIndex)?.effect_base_points_f !== undefined
  );
}

/**
 * Select the canonical default power by order index and source ID.
 *
 * Older payloads without `powers` fall back to the named scalar compatibility
 * projection so existing clients keep rendering resource costs.
 */
export function getDefaultPower(spell: WoWSpell): SpellPower | undefined {
  if (spell.powers !== undefined) {
    return spell.powers.reduce<SpellPower | undefined>((selected, power) => {
      if (
        selected === undefined ||
        power.order_index < selected.order_index ||
        (power.order_index === selected.order_index &&
          power.source_id < selected.source_id)
      ) {
        return power;
      }
      return selected;
    }, undefined);
  }

  return {
    order_index: 0,
    source_id: 0,
    mana_cost: spell.mana_cost,
    mana_cost_per_level: spell.mana_cost_per_level,
    mana_per_second: spell.mana_per_second,
    power_cost_pct: spell.mana_cost_pct,
    power_type: spell.power_type.value,
  };
}
