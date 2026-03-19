/**
 * Character building from config + items. Ported from simulation/character.go.
 */

import type { SimItem } from "../api/typesGenerated";
import {
  type CombatUnit,
  type CreatureData,
  type PlayerBaseStats,
  createCombatUnit,
  PowerMana,
  ItemModStrength,
  ItemModAgility,
  ItemModStamina,
  ItemModIntellect,
  ItemModSpirit,
  ItemModHitRating,
  ItemModCritRating,
  ItemModAttackPower,
  ItemModRangedAttackPower,
  ItemModSpellPower,
  InvTypeWeapon,
  InvTypeMainHand,
  InvType2HWeapon,
  InvTypeOffHand,
} from "./types";

export interface CharacterConfig {
  race: number;
  classId: number;
  level: number;
  gear: Map<number, SimItem>; // slot → item
  talents: Map<number, number>; // talentSpellID → points
  buffs: number[];
}

/** Build a CombatUnit by aggregating base stats + gear. */
export function buildCombatUnit(
  config: CharacterConfig,
  baseStats: PlayerBaseStats | null,
): CombatUnit {
  const unit = createCombatUnit();
  unit.level = config.level;
  unit.isPlayer = true;
  unit.weaponSkill = config.level * 5;
  unit.powerType = PowerMana;

  if (baseStats) {
    applyBaseStats(unit, config.classId, baseStats);
  } else {
    // Fallback defaults
    unit.health = 3000;
    unit.maxHealth = 3000;
    unit.power = 4000;
    unit.maxPower = 4000;
  }

  for (const item of config.gear.values()) {
    applyItemStats(unit, item);
  }

  return unit;
}

function applyBaseStats(unit: CombatUnit, classId: number, base: PlayerBaseStats): void {
  const str = base.str;
  const agi = base.agi;
  const sta = base.sta;
  const intel = base.int;

  // Stamina → HP
  if (sta > 20) {
    unit.health += 20 + (sta - 20) * 10;
    unit.maxHealth += 20 + (sta - 20) * 10;
  } else {
    unit.health += sta;
    unit.maxHealth += sta;
  }

  // Intellect → Mana
  if (intel > 20) {
    unit.power += 20 + (intel - 20) * 15;
    unit.maxPower += 20 + (intel - 20) * 15;
  } else {
    unit.power += intel;
    unit.maxPower += intel;
  }

  // Strength → AP
  if (classId === 1 || classId === 2) {
    unit.attackPower += str * 2;
  } else {
    unit.attackPower += str;
  }

  // Agility → AP for rogues/hunters
  if (classId === 3) {
    unit.rangedAP += agi;
    unit.attackPower += agi;
  } else if (classId === 4) {
    unit.attackPower += agi;
  }

  // Agility → crit
  unit.critChance += agi / 20.0;

  // Intellect → spell crit
  unit.spellCrit += intel / 59.5;
}

function applyItemStats(unit: CombatUnit, item: SimItem): void {
  unit.armor += item.armor;

  // Resistances
  for (let i = 0; i < 6; i++) {
    unit.resistances[i] += item.resistances[i];
  }

  // Stat bonuses
  if (item.stats) {
    for (const stat of item.stats) {
      if (stat.type === 0 && stat.value === 0) continue;
      switch (stat.type) {
        case ItemModStrength:
          unit.attackPower += stat.value;
          break;
        case ItemModAgility:
          unit.critChance += stat.value / 20.0;
          break;
        case ItemModStamina:
          unit.health += stat.value * 10;
          unit.maxHealth += stat.value * 10;
          break;
        case ItemModIntellect:
          unit.power += stat.value * 15;
          unit.maxPower += stat.value * 15;
          unit.spellCrit += stat.value / 59.5;
          break;
        case ItemModSpirit:
          break; // mana regen handled elsewhere
        case ItemModHitRating:
          unit.hitChance += stat.value;
          unit.spellHit += stat.value;
          break;
        case ItemModCritRating:
          unit.critChance += stat.value;
          unit.spellCrit += stat.value;
          break;
        case ItemModAttackPower:
          unit.attackPower += stat.value;
          break;
        case ItemModRangedAttackPower:
          unit.rangedAP += stat.value;
          break;
        case ItemModSpellPower:
          unit.spellPower[0] += stat.value;
          break;
      }
    }
  }

  // Weapon damage
  if (item.delay > 0 && item.damage) {
    for (const dmg of item.damage) {
      if (dmg.min === 0 && dmg.max === 0) continue;
      if (dmg.damage_type === 0) {
        switch (item.inventory_type) {
          case InvTypeWeapon:
          case InvTypeMainHand:
          case InvType2HWeapon:
            unit.mhDmgMin += dmg.min;
            unit.mhDmgMax += dmg.max;
            unit.mhSpeedMs = item.delay;
            break;
          case InvTypeOffHand:
            unit.ohDmgMin += dmg.min;
            unit.ohDmgMax += dmg.max;
            unit.ohSpeedMs = item.delay;
            break;
        }
      }
    }
  }
}

/** Build a CombatUnit from boss/creature preset data. */
export function buildTargetUnit(c: CreatureData): CombatUnit {
  const unit = createCombatUnit();
  unit.level = c.level;
  unit.armor = c.armor;
  unit.resistances = [...c.resistances];
  unit.defenseSkill = c.level * 5;
  unit.isPlayer = false;
  unit.creatureType = c.creature_type;
  // Bosses have high health — use a large default
  unit.health = 1000000;
  unit.maxHealth = 1000000;
  return unit;
}
