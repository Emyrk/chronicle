/**
 * Spell modifier system. Ported from simulation/spellmod.go.
 */

import type { SpellData } from "./types";

export const SpellModOp = {
  Damage: 0,
  Duration: 1,
  Threat: 2,
  AttackPower: 3,
  Charges: 4,
  Range: 5,
  Radius: 6,
  CriticalChance: 7,
  AllEffects: 8,
  CastingTime: 10,
  Cooldown: 11,
  Cost: 14,
  CritDamageBonus: 15,
  HitChance: 16,
  Dot: 22,
  Haste: 23,
  SpellBonusDamage: 24,
} as const;
export type SpellModOp = (typeof SpellModOp)[keyof typeof SpellModOp];

export const SpellModFlat = 107;
export const SpellModPct = 108;

export interface SpellMod {
  op: SpellModOp;
  type: number; // SpellModFlat or SpellModPct
  value: number;
  mask: number; // SpellFamilyFlags match
  spellID: number;
  charges: number;
}

/** Apply all matching mods for a given op to a base value. */
export function applySpellMods(
  mods: SpellMod[],
  spell: SpellData,
  op: SpellModOp,
  baseValue: number,
): number {
  let flatSum = 0;
  let pctProduct = 1.0;

  for (const m of mods) {
    if (m.op !== op) continue;
    if (m.mask !== 0 && (spell.spellFamilyFlags & m.mask) === 0) continue;
    if (m.type === SpellModFlat) {
      flatSum += m.value;
    } else if (m.type === SpellModPct) {
      pctProduct *= 1.0 + m.value / 100.0;
    }
  }

  return (baseValue + flatSum) * pctProduct;
}
