/**
 * Combat formulas ported from simulation/combat/formulas.go.
 * All functions are pure math — no side effects.
 */

import { type MeleeOutcomeResult, Outcome } from "./types";

/** Fraction of physical damage mitigated by armor. Capped at 0.75. */
export function armorMitigation(armor: number, attackerLevel: number): number {
  if (armor < 0) armor = 0;
  const denom = 8.5 * attackerLevel + 40.0;
  let val = (0.1 * armor) / denom;
  val = val / (1.0 + val);
  return Math.max(0, Math.min(0.75, val));
}

/** Spell hit chance (0-100). */
export function spellHitChance(
  attackerLevel: number,
  victimLevel: number,
  attackerSpellHit: number,
  victimIsPlayer: boolean,
): number {
  const levelDiff = victimLevel - attackerLevel;
  const lchance = victimIsPlayer ? 7.0 : 11.0;
  let mod: number;
  if (levelDiff < 3) {
    mod = 96.0 - levelDiff;
  } else {
    mod = 94.0 - (levelDiff - 2) * lchance;
  }
  if (mod < 22) mod = 22;
  mod += attackerSpellHit;
  return Math.max(1, Math.min(99, mod));
}

/** Average partial resist fraction (0.0-0.75). */
export function spellResistChance(victimResistance: number, attackerLevel: number): number {
  if (attackerLevel <= 0) return 0;
  const resist = (victimResistance * 0.15) / attackerLevel;
  return Math.max(0, Math.min(0.75, resist));
}

/** Roll partial resist multiplier: 1.0, 0.75, 0.5, 0.25, or 0.0. */
export function rollPartialResist(rng: () => number, averageResist: number): number {
  if (averageResist <= 0) return 1.0;
  const roll = rng();
  const p0 = averageResist * averageResist;
  const p25 = averageResist * 2.0 * (1.0 - averageResist);
  let p50 = (1.0 - averageResist) * (1.0 - averageResist) * averageResist * 2.0;
  if (p0 + p25 + p50 > 1.0) p50 = 1.0 - p0 - p25;

  if (roll < p0) return 0.0;
  if (roll < p0 + p25) return 0.25;
  if (roll < p0 + p25 + p50) return 0.5;
  if (roll < p0 + p25 + p50 + averageResist * 0.5) return 0.75;
  return 1.0;
}

/** Turtle WoW glancing blow damage multiplier [0.65, 0.95]. */
export function turtleGlancingDamage(weaponSkill: number): number {
  if (weaponSkill <= 300) return 0.65;
  const dmg = 0.65 + 0.02 * (weaponSkill - 300);
  return Math.min(0.95, dmg);
}

/** Turtle WoW glancing miss probability [5.0, 8.0]. */
export function turtleGlancingMissReduction(weaponSkill: number): number {
  if (weaponSkill <= 300) return 8.0;
  const miss = 8.0 - 0.2 * (weaponSkill - 300);
  return Math.max(5.0, miss);
}

/** Two-roll cumulative melee outcome table. */
export function rollMeleeOutcome(
  rng: () => number,
  missChance: number,
  dodgeChance: number,
  parryChance: number,
  glancingChance: number,
  blockChance: number,
  critChance: number,
  crushingChance: number,
  fromBehind: boolean,
  isSpell: boolean,
  weaponSkill: number,
): MeleeOutcomeResult {
  const roll = rng() * 100.0;
  let sum = 0.0;

  sum += missChance;
  if (roll < sum) return { outcome: Outcome.Miss, glancingDmgMult: 0 };

  if (!fromBehind) {
    sum += dodgeChance;
    if (roll < sum) return { outcome: Outcome.Dodge, glancingDmgMult: 0 };
  }

  if (!fromBehind && parryChance > 0) {
    sum += parryChance;
    if (roll < sum) return { outcome: Outcome.Parry, glancingDmgMult: 0 };
  }

  if (!isSpell && glancingChance > 0) {
    sum += glancingChance;
    if (roll < sum) {
      return { outcome: Outcome.Glancing, glancingDmgMult: turtleGlancingDamage(weaponSkill) };
    }
  }

  if (!fromBehind && blockChance > 0) {
    sum += blockChance;
    if (roll < sum) return { outcome: Outcome.Block, glancingDmgMult: 0 };
  }

  if (critChance > 0) {
    sum += critChance;
    if (roll < sum) return { outcome: Outcome.Crit, glancingDmgMult: 0 };
  }

  if (!isSpell && crushingChance > 0) {
    sum += crushingChance;
    if (roll < sum) return { outcome: Outcome.Crushing, glancingDmgMult: 0 };
  }

  return { outcome: Outcome.Hit, glancingDmgMult: 0 };
}

/** Base melee miss chance. */
export function meleeMissChance(
  attackerWeaponSkill: number,
  victimDefenseSkill: number,
  dualWield: boolean,
): number {
  const skillDiff = victimDefenseSkill - attackerWeaponSkill;
  let miss: number;
  if (skillDiff <= 10) {
    miss = 5.0 + skillDiff * 0.1;
  } else {
    miss = 5.0 + skillDiff * 0.2;
  }
  if (attackerWeaponSkill > 300) {
    miss -= (attackerWeaponSkill - 300) * 0.2;
  }
  if (dualWield) miss += 19.0;
  return Math.max(0, miss);
}

/** Default spell power coefficient. */
export function defaultSpellCoefficient(
  castTimeMs: number,
  durationMs: number,
  isDoT: boolean,
  isChanneled: boolean,
  numTicks: number,
): number {
  if (isDoT) {
    if (isChanneled) {
      return numTicks > 0 ? 1.0 / numTicks : 1.0;
    }
    const totalCoeff = durationMs / 15000.0;
    return numTicks > 0 ? totalCoeff / numTicks : totalCoeff;
  }
  return castTimeMs / 3500.0;
}

/** Low-level spell scaling penalty. */
export function levelPenalty(spellLevel: number): number {
  if (spellLevel <= 0 || spellLevel > 20) return 1.0;
  return Math.max(0, 1.0 - (20 - spellLevel) * 0.0375);
}

/** Normalized weapon speed in ms for instant melee attacks. */
export function normalizedWeaponSpeed(inventoryType: number): number {
  switch (inventoryType) {
    case 13: return 2400; // 1H
    case 17: return 3300; // 2H
    case 15: return 2800; // ranged
    default: return 1700; // daggers etc
  }
}
