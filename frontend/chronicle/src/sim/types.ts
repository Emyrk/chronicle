/**
 * Game data types and constants for the DPS simulation engine.
 * Ported from simulation/gamedata/types.go and simulation/combat/types.go.
 */

// Schools of magic
export const SchoolPhysical = 0;
export const SchoolHoly = 1;
export const SchoolFire = 2;
export const SchoolNature = 3;
export const SchoolFrost = 4;
export const SchoolShadow = 5;
export const SchoolArcane = 6;
export const NumSchools = 7;

// School masks (bit flags)
export const SchoolMaskPhysical = 1 << SchoolPhysical;
export const SchoolMaskHoly = 1 << SchoolHoly;
export const SchoolMaskFire = 1 << SchoolFire;
export const SchoolMaskNature = 1 << SchoolNature;
export const SchoolMaskFrost = 1 << SchoolFrost;
export const SchoolMaskShadow = 1 << SchoolShadow;
export const SchoolMaskArcane = 1 << SchoolArcane;

// Power types
export const PowerMana = 0;
export const PowerRage = 1;
export const PowerFocus = 2;
export const PowerEnergy = 3;

// Spell damage class
export const SpellDmgClassNone = 0;
export const SpellDmgClassMagic = 1;
export const SpellDmgClassMelee = 2;
export const SpellDmgClassRanged = 3;

// Spell effect types
export const SpellEffectNone = 0;
export const SpellEffectInstakill = 1;
export const SpellEffectSchoolDamage = 2;
export const SpellEffectDummy = 3;
export const SpellEffectApplyAura = 6;
export const SpellEffectPowerDrain = 8;
export const SpellEffectHeal = 10;
export const SpellEffectEnergize = 30;
export const SpellEffectWeaponDamage = 35;
export const SpellEffectWeaponDmgPct = 36;
export const SpellEffectTriggerSpell = 64;
export const SpellEffectNormalizedWeaponDmg = 121;

// Aura types
export const AuraNone = 0;
export const AuraPeriodicDamage = 3;
export const AuraDummy = 4;
export const AuraPeriodicHeal = 8;
export const AuraModAttackSpeed = 9;
export const AuraModDamageDone = 13;
export const AuraModStat = 29;
export const AuraModIncreaseSpeed = 31;
export const AuraProcTriggerSpell = 42;
export const AuraModDamagePercentDone = 79;
export const AuraModDamagePercentTaken = 87;
export const AuraAddFlatModifier = 107;
export const AuraAddPctModifier = 108;

// Item stat type constants
export const ItemModMana = 0;
export const ItemModHealth = 1;
export const ItemModAgility = 3;
export const ItemModStrength = 4;
export const ItemModIntellect = 5;
export const ItemModSpirit = 6;
export const ItemModStamina = 7;
export const ItemModHitRating = 31;
export const ItemModCritRating = 32;
export const ItemModAttackPower = 38;
export const ItemModRangedAttackPower = 39;
export const ItemModSpellPower = 45;

// Inventory type (slot) constants
export const InvTypeHead = 1;
export const InvTypeNeck = 2;
export const InvTypeShoulder = 3;
export const InvTypeChest = 5;
export const InvTypeWaist = 6;
export const InvTypeLegs = 7;
export const InvTypeFeet = 8;
export const InvTypeWrist = 9;
export const InvTypeHands = 10;
export const InvTypeFinger = 11;
export const InvTypeTrinket = 12;
export const InvTypeWeapon = 13;
export const InvTypeShield = 14;
export const InvTypeRanged = 15;
export const InvTypeBack = 16;
export const InvType2HWeapon = 17;
export const InvTypeMainHand = 21;
export const InvTypeOffHand = 22;

// Creature types
export const CreatureTypeBeast = 1;
export const CreatureTypeDragonkin = 2;
export const CreatureTypeDemon = 3;
export const CreatureTypeElemental = 4;
export const CreatureTypeGiant = 5;
export const CreatureTypeUndead = 6;
export const CreatureTypeHumanoid = 7;
export const CreatureTypeCritter = 8;
export const CreatureTypeMechanical = 9;

// Item trigger types
export const ItemTriggerOnEquip = 0;
export const ItemTriggerOnHit = 1;
export const ItemTriggerOnUse = 2;
export const ItemTriggerOnProc = 6;

// --- Data types ---

export interface SpellEffect {
  type: number;
  basePoints: number;
  dieSides: number;
  baseDice: number;
  pointsPerLevel: number;
  dicePerLevel: number;
  bonusCoefficient: number;
  auraType: number;
  auraPeriodMs: number;
  amplitude: number;
  triggerSpellId: number;
  chainTargets: number;
  pointsPerCombo: number;
  miscValue: number;
  mechanicMask: number;
}

export interface SpellData {
  id: number;
  name: string;
  school: number;
  dmgClass: number;
  powerType: number;
  manaCost: number;
  manaCostPct: number;
  castTimeMs: number;
  cooldownMs: number;
  categoryCooldownMs: number;
  gcdMs: number;
  durationMs: number;
  spellLevel: number;
  baseLevel: number;
  maxLevel: number;
  effects: [SpellEffect, SpellEffect, SpellEffect];
  procFlags: number;
  procChance: number;
  procCharges: number;
  speed: number;
  mechanic: number;
  attributes: [number, number, number, number, number];
  spellFamilyName: number;
  spellFamilyFlags: number;
  maxTargetLevel: number;
  maxAffectedTargets: number;
  equippedItemClass: number;
  equippedItemSubclass: number;
}

export interface CreatureData {
  name: string;
  level: number;
  armor: number;
  resistances: [number, number, number, number, number, number];
  creature_type: number;
}

export interface PlayerBaseStats {
  str: number;
  agi: number;
  sta: number;
  int: number;
  spi: number;
}

// --- Combat runtime types ---

export enum Outcome {
  Hit,
  Crit,
  Miss,
  Dodge,
  Parry,
  Glancing,
  Block,
  Crushing,
  Resist,
}

export enum AttackType {
  MainHand,
  OffHand,
  Ranged,
}

export interface CombatUnit {
  level: number;
  health: number;
  maxHealth: number;
  power: number;
  maxPower: number;
  powerType: number;
  armor: number;
  resistances: number[]; // [holy, fire, nature, frost, shadow, arcane]
  attackPower: number;
  rangedAP: number;
  spellPower: number[]; // [allSchools, holy, fire, nature, frost, shadow, arcane]
  hitChance: number;
  spellHit: number;
  critChance: number;
  spellCrit: number;
  weaponSkill: number;
  defenseSkill: number;
  mhDmgMin: number;
  mhDmgMax: number;
  mhSpeedMs: number;
  ohDmgMin: number;
  ohDmgMax: number;
  ohSpeedMs: number;
  isPlayer: boolean;
  creatureType: number;
}

export interface DamageResult {
  damage: number;
  outcome: Outcome;
  school: number;
  resisted: number;
  absorbed: number;
}

export interface MeleeOutcomeResult {
  outcome: Outcome;
  glancingDmgMult: number;
}

export function getResistanceForSchool(unit: CombatUnit, schoolMask: number): number {
  let best = 0;
  for (let i = 1; i < NumSchools; i++) {
    if (schoolMask & (1 << i)) {
      const r = unit.resistances[i - 1] ?? 0;
      if (r > best) best = r;
    }
  }
  return best;
}

export function createCombatUnit(): CombatUnit {
  return {
    level: 60,
    health: 0,
    maxHealth: 0,
    power: 0,
    maxPower: 0,
    powerType: PowerMana,
    armor: 0,
    resistances: [0, 0, 0, 0, 0, 0],
    attackPower: 0,
    rangedAP: 0,
    spellPower: [0, 0, 0, 0, 0, 0, 0],
    hitChance: 0,
    spellHit: 0,
    critChance: 0,
    spellCrit: 0,
    weaponSkill: 300,
    defenseSkill: 0,
    mhDmgMin: 0,
    mhDmgMax: 0,
    mhSpeedMs: 0,
    ohDmgMin: 0,
    ohDmgMax: 0,
    ohSpeedMs: 0,
    isPlayer: true,
    creatureType: 0,
  };
}
