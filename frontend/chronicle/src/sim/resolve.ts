/**
 * Spell and melee damage resolution pipeline.
 * Ported from simulation/combat/resolve.go.
 */

import {
  type CombatUnit,
  type DamageResult,
  type SpellData,
  type SpellEffect,
  NumSchools,
  Outcome,
  AttackType,
  SchoolMaskPhysical,
  getResistanceForSchool,
} from "./types";
import {
  armorMitigation,
  spellHitChance,
  spellResistChance,
  rollPartialResist,
  defaultSpellCoefficient,
  levelPenalty,
  meleeMissChance,
  rollMeleeOutcome,
} from "./formulas";

/** Compute base damage from a spell effect template. */
export function calculateSpellEffectValue(
  effect: SpellEffect,
  casterLevel: number,
  spellLevel: number,
  comboPoints: number,
  rng: () => number,
): number {
  let value = effect.basePoints;

  // Level scaling
  if (spellLevel > 0 && casterLevel > spellLevel) {
    value += (casterLevel - spellLevel) * effect.pointsPerLevel;
  }

  // Random range
  if (effect.dieSides > 0) {
    let minRoll = effect.baseDice > 0 ? effect.baseDice : 1;
    let maxRoll = effect.dieSides;
    if (maxRoll < minRoll) [minRoll, maxRoll] = [maxRoll, minRoll];
    value += minRoll + Math.floor(rng() * (maxRoll - minRoll + 1));
  }

  // Combo point bonus
  if (comboPoints > 0 && effect.pointsPerCombo > 0) {
    value += comboPoints * effect.pointsPerCombo;
  }

  return Math.round(value);
}

/** Spell power coefficient for a given effect. */
export function spellBonusCoefficient(spell: SpellData, effectIdx: number, isDoT: boolean): number {
  const eff = spell.effects[effectIdx];
  if (eff.bonusCoefficient >= 0) return eff.bonusCoefficient;

  let numTicks = 0;
  if (isDoT && eff.auraPeriodMs > 0 && spell.durationMs > 0) {
    numTicks = Math.floor(spell.durationMs / eff.auraPeriodMs);
  }
  return defaultSpellCoefficient(spell.castTimeMs, spell.durationMs, isDoT, false, numTicks);
}

/** Full spell damage pipeline for one effect. */
export function resolveSpellDamage(
  spell: SpellData,
  effectIdx: number,
  caster: CombatUnit,
  target: CombatUnit,
  rng: () => number,
): DamageResult {
  const eff = spell.effects[effectIdx];

  // 1. Base damage
  const baseDmg = calculateSpellEffectValue(eff, caster.level, spell.spellLevel, 0, rng);

  // 2. Spell power bonus
  const coeff = spellBonusCoefficient(spell, effectIdx, false);
  let sp = caster.spellPower[0];
  for (let i = 1; i < NumSchools; i++) {
    if (spell.school & (1 << i) && caster.spellPower[i] > sp) {
      sp = caster.spellPower[i];
    }
  }
  const bonus = sp * coeff * levelPenalty(spell.spellLevel);
  let totalDmg = baseDmg + bonus;

  // 3. Crit check
  let outcome = Outcome.Hit;
  if (rng() * 100.0 < caster.spellCrit) {
    totalDmg *= 1.5;
    outcome = Outcome.Crit;
  }

  // 4. Spell hit check
  const hitChance = spellHitChance(caster.level, target.level, caster.spellHit, target.isPlayer);
  if (rng() * 100.0 >= hitChance) {
    return { damage: 0, outcome: Outcome.Resist, school: spell.school, resisted: 0, absorbed: 0 };
  }

  // 5. Armor mitigation (physical)
  if (spell.school === SchoolMaskPhysical) {
    totalDmg *= 1.0 - armorMitigation(target.armor, caster.level);
  }

  // 6. Partial resist (non-physical)
  let resisted = 0;
  if (spell.school !== SchoolMaskPhysical) {
    const resistance = getResistanceForSchool(target, spell.school);
    const avgResist = spellResistChance(resistance, caster.level);
    const mult = rollPartialResist(rng, avgResist);
    if (mult < 1.0) {
      resisted = Math.round(totalDmg * (1.0 - mult));
      totalDmg *= mult;
    }
  }

  return {
    damage: Math.max(0, Math.round(totalDmg)),
    outcome,
    school: spell.school,
    resisted,
    absorbed: 0,
  };
}

/** Full melee damage pipeline for one swing. */
export function resolveMeleeDamage(
  caster: CombatUnit,
  target: CombatUnit,
  attackType: AttackType,
  weaponSkill: number,
  rng: () => number,
): DamageResult {
  let dmgMin: number, dmgMax: number, speedMs: number;
  if (attackType === AttackType.OffHand) {
    dmgMin = caster.ohDmgMin;
    dmgMax = caster.ohDmgMax;
    speedMs = caster.ohSpeedMs;
  } else {
    dmgMin = caster.mhDmgMin;
    dmgMax = caster.mhDmgMax;
    speedMs = caster.mhSpeedMs;
  }

  const apBonus = (caster.attackPower / 14.0) * (speedMs / 1000.0);
  let rawDmg = dmgMin + rng() * (dmgMax - dmgMin) + apBonus;

  if (attackType === AttackType.OffHand) rawDmg *= 0.5;

  const defenseSkill = target.defenseSkill || target.level * 5;
  const dualWield = caster.ohSpeedMs > 0;
  let missChance = meleeMissChance(weaponSkill, defenseSkill, dualWield) - caster.hitChance;
  if (missChance < 0) missChance = 0;

  const dodgeChance = 5.0;
  let glancingChance = 0;
  const levelDiff = target.level - caster.level;
  if (levelDiff > 0 && caster.isPlayer && !target.isPlayer) {
    glancingChance = Math.min(40.0, 10.0 + levelDiff * 10.0);
  }

  const outcomeResult = rollMeleeOutcome(
    rng, missChance, dodgeChance, 0, glancingChance, 0,
    caster.critChance, 0, true, false, weaponSkill,
  );

  switch (outcomeResult.outcome) {
    case Outcome.Miss:
    case Outcome.Dodge:
    case Outcome.Parry:
      return { damage: 0, outcome: outcomeResult.outcome, school: SchoolMaskPhysical, resisted: 0, absorbed: 0 };
    case Outcome.Glancing:
      rawDmg *= outcomeResult.glancingDmgMult;
      break;
    case Outcome.Crit:
      rawDmg *= 2.0;
      break;
    case Outcome.Crushing:
      rawDmg *= 1.5;
      break;
    case Outcome.Block:
      rawDmg -= target.armor * 0.01;
      if (rawDmg < 0) rawDmg = 0;
      break;
  }

  rawDmg *= 1.0 - armorMitigation(target.armor, caster.level);

  return {
    damage: Math.max(0, Math.round(rawDmg)),
    outcome: outcomeResult.outcome,
    school: SchoolMaskPhysical,
    resisted: 0,
    absorbed: 0,
  };
}
