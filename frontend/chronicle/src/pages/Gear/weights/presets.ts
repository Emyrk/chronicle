/**
 * Built-in stat-weight presets: a decent starting point per class/spec,
 * shipped with the app (no server state). Sources and assumptions are
 * documented per preset and in research/stat-weights.md; every number
 * was taken from the cited source, normalized as published.
 *
 * Units follow each game version's items: vanilla hit/crit weights are
 * per 1%, TBC/WotLK weights are per rating point. Ratios are only
 * meaningful within a single preset.
 */
import type { StatWeights } from "../builder/gearScoring";

export type GameFlavor = "vanilla" | "tbc" | "wrath";

export interface WeightPreset {
  id: string;
  name: string;
  classId: number;
  specName: string;
  flavor: GameFlavor;
  description: string;
  weights: StatWeights;
}

/** Resolve the site's game flavor from dataset_flavor tags. */
export function flavorFromTags(tags: readonly string[]): GameFlavor {
  if (tags.includes("wrath")) return "wrath";
  if (tags.includes("tbc")) return "tbc";
  return "vanilla";
}

export function presetsForFlavor(tags: readonly string[]): WeightPreset[] {
  const flavor = flavorFromTags(tags);
  return WEIGHT_PRESETS.filter((p) => p.flavor === flavor);
}

const WOWSIMS_CLASSIC = "wowsims Classic default EP preset (raid-buffed, level 63 boss)";
// Several wowsims Classic presets are verbatim WotLK placeholders (the sim
// is forked from the WotLK codebase); those specs get heuristic vanilla
// weights instead. See research/stat-weights.md.
const HEURISTIC =
  "Heuristic starting point derived from vanilla stat conversions — the wowsims Classic preset for this spec is a WotLK placeholder. Tune to taste.";
const WOWSIMS_TBC = "wowsims TBC default EP preset (raid-buffed)";
const WOWSIMS_WOTLK = "wowsims WotLK default EP preset (ICC-era, raid-buffed)";
const PAWN_TBC = "Pawn 2.4.3 scale (Elitist Jerks-derived), primary stat = 1";
const PAWN_WOTLK = "Wowhead 3.3.5 Pawn scale, best stat = 100, assumes you are under the hit cap";

// Class IDs: 1 Warrior, 2 Paladin, 3 Hunter, 4 Rogue, 5 Priest,
// 6 Death Knight, 7 Shaman, 8 Mage, 9 Warlock, 11 Druid.
export const WEIGHT_PRESETS: WeightPreset[] = [
  // ── Vanilla (weights per 1% hit/crit) ─────────────────────────
  {
    id: "vanilla-warrior-fury", name: "Fury Warrior", classId: 1, specName: "Fury", flavor: "vanilla",
    description: `Below the hit cap. ${WOWSIMS_CLASSIC}.`,
    weights: { strength: 2.51, agility: 1.86, attack_power: 1, hit: 28.67, crit: 25.1, weapon_dps: 11.92 },
  },
  {
    id: "vanilla-warrior-prot", name: "Protection Warrior", classId: 1, specName: "Protection", flavor: "vanilla",
    description: `Mitigation-first. ${HEURISTIC} Ratios: 1 Defense ≈ 0.16% combined avoidance/block, 20 Agi ≈ 1% dodge, 1 Sta = 10 HP.`,
    weights: { stamina: 1, agility: 0.7, strength: 0.4, armor: 0.07, defense: 1.5, dodge: 10, parry: 8, block: 3, block_value: 0.3, hit: 4, crit: 2 },
  },
  {
    id: "vanilla-rogue-combat", name: "Combat Rogue", classId: 4, specName: "Combat", flavor: "vanilla",
    description: `Below the 9% special-attack hit cap. ${WOWSIMS_CLASSIC}.`,
    weights: { agility: 2.38, strength: 1.26, attack_power: 1, hit: 29.44, crit: 17.92, weapon_dps: 10.49 },
  },
  {
    id: "vanilla-hunter", name: "Hunter (ranged)", classId: 3, specName: "Marksmanship", flavor: "vanilla",
    description: "Icy Veins equivalences (1 Agi ≈ 2.5 AP; 1% hit or crit ≈ 32 AP) on a wowsims ranged anchor. Below the 9% hit cap.",
    weights: { agility: 2.5, ranged_attack_power: 1, attack_power: 1, hit: 32, crit: 32, weapon_dps: 6.32 },
  },
  {
    id: "vanilla-mage", name: "Mage", classId: 8, specName: "Fire", flavor: "vanilla",
    description: `Below the spell hit cap (10% with Elemental Precision). ${WOWSIMS_CLASSIC}.`,
    weights: { spell_power: 1, intellect: 0.49, hit: 18.59, crit: 13.91, haste: 6.85, mp5: 0.11 },
  },
  {
    id: "vanilla-warlock", name: "Warlock", classId: 9, specName: "Destruction", flavor: "vanilla",
    description: `Below the 16% spell hit cap. ${WOWSIMS_CLASSIC}.`,
    weights: { spell_power: 1, intellect: 0.23, hit: 12.79, crit: 7.92, haste: 7.83, mp5: 0.14 },
  },
  {
    id: "vanilla-priest-shadow", name: "Shadow Priest", classId: 5, specName: "Shadow", flavor: "vanilla",
    description: WOWSIMS_CLASSIC + ".",
    weights: { spell_power: 1, intellect: 0.16, spirit: 0.01, hit: 5.51, crit: 5.99, haste: 1.65 },
  },
  {
    id: "vanilla-priest-heal", name: "Healing Priest", classId: 5, specName: "Holy", flavor: "vanilla",
    description: `Mana-weighted healer set. ${HEURISTIC} Longevity first: mp5 and spirit over raw +healing.`,
    weights: { healing: 1, mp5: 2, intellect: 0.5, spirit: 0.5, crit: 2 },
  },
  {
    id: "vanilla-shaman-ele", name: "Elemental Shaman", classId: 7, specName: "Elemental", flavor: "vanilla",
    description: WOWSIMS_CLASSIC + ".",
    weights: { spell_power: 1, intellect: 0.14, hit: 12.37, crit: 7.57, haste: 1.49 },
  },
  {
    id: "vanilla-shaman-enh", name: "Enhancement Shaman", classId: 7, specName: "Enhancement", flavor: "vanilla",
    description: WOWSIMS_CLASSIC + ".",
    weights: { strength: 2.29, agility: 1.12, attack_power: 1, spell_power: 1.15, hit: 9.62, crit: 14.8, weapon_dps: 8.15 },
  },
  {
    id: "vanilla-shaman-resto", name: "Restoration Shaman", classId: 7, specName: "Restoration", flavor: "vanilla",
    description: `${HEURISTIC} Longevity first: mp5 over raw +healing; shamans lean on mp5 more than spirit.`,
    weights: { healing: 1, mp5: 2.2, intellect: 0.5, spirit: 0.25, crit: 2 },
  },
  {
    id: "vanilla-druid-balance", name: "Balance Druid", classId: 11, specName: "Balance", flavor: "vanilla",
    description: WOWSIMS_CLASSIC + ".",
    weights: { spell_power: 1, intellect: 0.16, hit: 11.75, crit: 7.5, haste: 0.8 },
  },
  {
    id: "vanilla-druid-cat", name: "Feral Druid (cat)", classId: 11, specName: "Feral", flavor: "vanilla",
    description: `Powershifting build. ${WOWSIMS_CLASSIC}.`,
    weights: { agility: 2.43, strength: 2.4, attack_power: 1, intellect: 0.61, hit: 26.59, crit: 28.68, mp5: 0.79 },
  },
  {
    id: "vanilla-druid-bear", name: "Feral Druid (bear)", classId: 11, specName: "Feral", flavor: "vanilla",
    description: `Tank set. ${HEURISTIC} Armor weighs high because Dire Bear Form multiplies item armor.`,
    weights: { stamina: 1, agility: 0.8, strength: 0.5, armor: 0.12, dodge: 10, defense: 1.3, hit: 4, crit: 2.5 },
  },
  {
    id: "vanilla-druid-resto", name: "Restoration Druid", classId: 11, specName: "Restoration", flavor: "vanilla",
    description: `${HEURISTIC} Longevity first; crit matters little for HoT-centric healing.`,
    weights: { healing: 1, mp5: 2, intellect: 0.5, spirit: 0.45, crit: 0.5 },
  },
  {
    id: "vanilla-paladin-ret", name: "Retribution Paladin", classId: 2, specName: "Retribution", flavor: "vanilla",
    description: `${HEURISTIC} Ratios: 1 Str = 2 AP, ~25 Agi = 1% crit, slow-weapon Seal damage favors weapon DPS.`,
    weights: { strength: 2, agility: 1.5, attack_power: 1, spell_power: 0.4, hit: 15, crit: 12, weapon_dps: 8 },
  },

  // ── TBC (weights per rating point) ────────────────────────────
  {
    id: "tbc-warrior-fury", name: "Fury Warrior", classId: 1, specName: "Fury", flavor: "tbc",
    description: `Assumes near hit cap (9% = 142 rating). ${WOWSIMS_TBC}.`,
    weights: { strength: 2.17, agility: 1.4, attack_power: 1, hit: 0.41, crit: 1.83, haste: 2.07, expertise: 3.29, armor_penetration: 0.5 },
  },
  {
    id: "tbc-warrior-prot", name: "Protection Warrior", classId: 1, specName: "Protection", flavor: "tbc",
    description: `Stamina-anchored tank set. ${WOWSIMS_TBC}.`,
    weights: { stamina: 1, strength: 0.33, agility: 0.6, defense: 0.8, dodge: 0.7, parry: 0.58, block: 0.35, block_value: 0.59, hit: 0.67, expertise: 0.67, armor: 0.05 },
  },
  {
    id: "tbc-hunter-bm", name: "Beast Mastery Hunter", classId: 3, specName: "Beast Mastery", flavor: "tbc",
    description: `Assumes near hit cap. ${WOWSIMS_TBC}.`,
    weights: { agility: 2.5, ranged_attack_power: 1, strength: 0.15, hit: 0.3, crit: 2.3, haste: 1.97, armor_penetration: 0.4 },
  },
  {
    id: "tbc-rogue-combat", name: "Combat Rogue", classId: 4, specName: "Combat", flavor: "tbc",
    description: `Below hit cap. ${WOWSIMS_TBC}.`,
    weights: { agility: 2.21, strength: 1.1, attack_power: 1, hit: 2.85, crit: 1.76, haste: 2.31, expertise: 3.11, armor_penetration: 0.44 },
  },
  {
    id: "tbc-mage-arcane", name: "Arcane Mage", classId: 8, specName: "Arcane", flavor: "tbc",
    description: `Mana-hungry: spirit and mp5 matter. ${WOWSIMS_TBC}.`,
    weights: { spell_power: 1, intellect: 1.29, spirit: 0.89, crit: 0.77, haste: 0.84, mp5: 0.61 },
  },
  {
    id: "tbc-mage-fire", name: "Fire Mage", classId: 8, specName: "Fire", flavor: "tbc",
    description: `Below the spell hit cap. ${PAWN_TBC}.`,
    weights: { spell_power: 1, intellect: 0.44, hit: 0.93, crit: 0.77, haste: 0.82, mp5: 0.9 },
  },
  {
    id: "tbc-warlock-destro", name: "Destruction Warlock", classId: 9, specName: "Destruction", flavor: "tbc",
    description: `Assumes near hit cap. ${WOWSIMS_TBC}.`,
    weights: { spell_power: 1, intellect: 0.4, spirit: 0.1, crit: 0.8, haste: 1.2 },
  },
  {
    id: "tbc-warlock-affli", name: "Affliction Warlock", classId: 9, specName: "Affliction", flavor: "tbc",
    description: `Below the spell hit cap. ${PAWN_TBC}.`,
    weights: { spell_power: 1, intellect: 0.4, spirit: 0.1, hit: 1.2, crit: 0.39, haste: 0.78, mp5: 1 },
  },
  {
    id: "tbc-priest-shadow", name: "Shadow Priest", classId: 5, specName: "Shadow", flavor: "tbc",
    description: `Below the spell hit cap. ${PAWN_TBC}.`,
    weights: { spell_power: 1, intellect: 0.19, spirit: 0.21, hit: 1.12, crit: 0.76, haste: 0.65, mp5: 1 },
  },
  {
    id: "tbc-priest-holy", name: "Holy Priest", classId: 5, specName: "Holy", flavor: "tbc",
    description: PAWN_TBC + ", intellect = 1.",
    weights: { intellect: 1, spirit: 0.73, healing: 0.81, crit: 0.24, haste: 0.6, mp5: 1.35 },
  },
  {
    id: "tbc-shaman-ele", name: "Elemental Shaman", classId: 7, specName: "Elemental", flavor: "tbc",
    description: `Assumes near hit cap. ${WOWSIMS_TBC}.`,
    weights: { spell_power: 1, intellect: 0.33, crit: 0.78, haste: 1.25, mp5: 0.08 },
  },
  {
    id: "tbc-shaman-enh", name: "Enhancement Shaman", classId: 7, specName: "Enhancement", flavor: "tbc",
    description: WOWSIMS_TBC + ".",
    weights: { strength: 2.2, agility: 1.32, attack_power: 1, spell_power: 0.43, hit: 1.67, crit: 1.36, haste: 1.94, expertise: 2.87, armor_penetration: 0.28 },
  },
  {
    id: "tbc-shaman-resto", name: "Restoration Shaman", classId: 7, specName: "Restoration", flavor: "tbc",
    description: PAWN_TBC + ", intellect = 1.",
    weights: { intellect: 1, spirit: 0.61, healing: 0.9, crit: 0.48, haste: 0.74, mp5: 1.33 },
  },
  {
    id: "tbc-druid-balance", name: "Balance Druid", classId: 11, specName: "Balance", flavor: "tbc",
    description: `Assumes near hit cap. ${WOWSIMS_TBC}.`,
    weights: { spell_power: 1, intellect: 0.54, spirit: 0.1, crit: 0.84, haste: 1.29 },
  },
  {
    id: "tbc-druid-cat", name: "Feral Druid (cat)", classId: 11, specName: "Feral", flavor: "tbc",
    description: WOWSIMS_TBC + ".",
    weights: { strength: 2.27, agility: 3.5, attack_power: 1, hit: 3.2, crit: 2.37, haste: 1.36, expertise: 3.2, armor_penetration: 0.47 },
  },
  {
    id: "tbc-druid-bear", name: "Feral Druid (bear)", classId: 11, specName: "Feral", flavor: "tbc",
    description: `Tank set. ${WOWSIMS_TBC}.`,
    weights: { agility: 4.6, stamina: 3.05, strength: 2.27, attack_power: 1, expertise: 7.3, hit: 3.5, defense: 2.2, dodge: 1.7, armor: 0.59 },
  },
  {
    id: "tbc-druid-resto", name: "Restoration Druid", classId: 11, specName: "Restoration", flavor: "tbc",
    description: PAWN_TBC + ", intellect = 1.",
    weights: { intellect: 1, spirit: 0.87, healing: 1.21, crit: 0.35, haste: 0.49, mp5: 1.7 },
  },
  {
    id: "tbc-paladin-ret", name: "Retribution Paladin", classId: 2, specName: "Retribution", flavor: "tbc",
    description: `Assumes near hit cap. ${WOWSIMS_TBC}.`,
    weights: { strength: 2.42, agility: 1.88, attack_power: 1, spell_power: 0.35, crit: 1.98, haste: 3.27, expertise: 4.7, armor_penetration: 0.24 },
  },
  {
    id: "tbc-paladin-holy", name: "Holy Paladin", classId: 2, specName: "Holy", flavor: "tbc",
    description: PAWN_TBC + ", intellect = 1.",
    weights: { intellect: 1, spirit: 0.28, healing: 0.54, crit: 0.46, haste: 0.39, mp5: 1.24 },
  },

  // ── WotLK (weights per rating point) ──────────────────────────
  {
    id: "wrath-warrior-fury", name: "Fury Warrior", classId: 1, specName: "Fury", flavor: "wrath",
    description: `Assumes near hit cap; ArP rises sharply toward the 1400 cap. ${WOWSIMS_WOTLK}.`,
    weights: { strength: 2.72, agility: 1.82, attack_power: 1, expertise: 2.55, hit: 0.79, crit: 2.12, haste: 1.72, armor_penetration: 2.17, weapon_dps: 6.29 },
  },
  {
    id: "wrath-warrior-prot", name: "Protection Warrior", classId: 1, specName: "Protection", flavor: "wrath",
    description: `Mitigation and threat blended. ${WOWSIMS_WOTLK}.`,
    weights: { stamina: 2.34, agility: 2.77, strength: 1.56, defense: 3.31, parry: 2.65, dodge: 2.61, expertise: 1.44, hit: 1.43, block_value: 1.37, block: 1.32, armor_penetration: 1.06, crit: 0.93 },
  },
  {
    id: "wrath-dk-unholy", name: "Unholy Death Knight (DW)", classId: 6, specName: "Unholy", flavor: "wrath",
    description: `Below hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { strength: 3.22, agility: 0.62, attack_power: 1, hit: 1.92, haste: 1.85, expertise: 1.13, crit: 0.76, armor_penetration: 0.77 },
  },
  {
    id: "wrath-dk-frost", name: "Frost Death Knight", classId: 6, specName: "Frost", flavor: "wrath",
    description: PAWN_WOTLK + ".",
    weights: { hit: 100, strength: 97, expertise: 81, armor_penetration: 61, crit: 45, attack_power: 35, haste: 28 },
  },
  {
    id: "wrath-dk-blood-tank", name: "Blood Death Knight (tank)", classId: 6, specName: "Blood", flavor: "wrath",
    description: `Stamina-anchored tank set. ${WOWSIMS_WOTLK}.`,
    weights: { stamina: 1, strength: 0.33, agility: 0.6, defense: 0.8, dodge: 0.7, parry: 0.58, expertise: 0.67, hit: 0.67 },
  },
  {
    id: "wrath-hunter-survival", name: "Survival Hunter", classId: 3, specName: "Survival", flavor: "wrath",
    description: `Below hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { agility: 2.65, ranged_attack_power: 1, intellect: 1.1, hit: 2.0, crit: 1.5, haste: 1.39, armor_penetration: 1.32, stamina: 0.5 },
  },
  {
    id: "wrath-hunter-mm-arp", name: "Marksman Hunter (ArP build)", classId: 3, specName: "Marksmanship", flavor: "wrath",
    description: "Near-BiS ICC gear at ~1380 armor penetration, hit-capped. Rawr-computed (Warmane thread).",
    weights: { armor_penetration: 2.37, agility: 1.52, crit: 1.43, intellect: 0.7, ranged_attack_power: 0.68, haste: 0.31 },
  },
  {
    id: "wrath-rogue-assassination", name: "Assassination Rogue", classId: 4, specName: "Assassination", flavor: "wrath",
    description: `Below hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { agility: 1.86, strength: 1.14, attack_power: 1, haste: 1.48, hit: 1.39, crit: 1.32, expertise: 0.98, armor_penetration: 0.84 },
  },
  {
    id: "wrath-rogue-combat", name: "Combat Rogue", classId: 4, specName: "Combat", flavor: "wrath",
    description: `1400 ArP hard cap applies. ${PAWN_WOTLK}.`,
    weights: { armor_penetration: 100, agility: 100, expertise: 82, hit: 80, crit: 75, haste: 73, strength: 55, attack_power: 50 },
  },
  {
    id: "wrath-mage-fire", name: "Fire Mage", classId: 8, specName: "Fire", flavor: "wrath",
    description: `Assumes near hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { spell_power: 1, haste: 0.94, crit: 0.58, intellect: 0.48, spirit: 0.42, hit: 0.38, mp5: 0.09 },
  },
  {
    id: "wrath-mage-arcane", name: "Arcane Mage", classId: 8, specName: "Arcane", flavor: "wrath",
    description: PAWN_WOTLK + ".",
    weights: { hit: 100, haste: 54, spell_power: 49, crit: 37, intellect: 34, spirit: 14 },
  },
  {
    id: "wrath-warlock-affli", name: "Affliction Warlock", classId: 9, specName: "Affliction", flavor: "wrath",
    description: `Below hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { spell_power: 1, hit: 0.93, haste: 0.81, spirit: 0.54, crit: 0.53, intellect: 0.18 },
  },
  {
    id: "wrath-warlock-destro", name: "Destruction Warlock", classId: 9, specName: "Destruction", flavor: "wrath",
    description: PAWN_WOTLK + ".",
    weights: { hit: 100, spell_power: 47, haste: 46, spirit: 26, crit: 16, intellect: 13 },
  },
  {
    id: "wrath-priest-shadow", name: "Shadow Priest", classId: 5, specName: "Shadow", flavor: "wrath",
    description: WOWSIMS_WOTLK + ".",
    weights: { spell_power: 1, haste: 1.65, hit: 0.87, crit: 0.74, spirit: 0.47, intellect: 0.11 },
  },
  {
    id: "wrath-priest-disc", name: "Discipline Priest (healer)", classId: 5, specName: "Discipline", flavor: "wrath",
    description: `Mana-weighted healer set. ${WOWSIMS_WOTLK}.`,
    weights: { intellect: 2.73, mp5: 2.05, spirit: 1.63, spell_power: 1, crit: 0.75, haste: 0.28 },
  },
  {
    id: "wrath-shaman-ele", name: "Elemental Shaman", classId: 7, specName: "Elemental", flavor: "wrath",
    description: `Assumes hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { spell_power: 1, haste: 1.29, crit: 0.67, intellect: 0.22, mp5: 0.08 },
  },
  {
    id: "wrath-shaman-enh", name: "Enhancement Shaman", classId: 7, specName: "Enhancement", flavor: "wrath",
    description: `Assumes spell-hit and expertise caps. ${WOWSIMS_WOTLK}.`,
    weights: { agility: 1.59, intellect: 1.48, strength: 1.1, spell_power: 1.13, attack_power: 1, haste: 1.61, hit: 1.38, crit: 0.81, armor_penetration: 0.48 },
  },
  {
    id: "wrath-shaman-resto", name: "Restoration Shaman", classId: 7, specName: "Restoration", flavor: "wrath",
    description: WOWSIMS_WOTLK + ".",
    weights: { spell_power: 1, haste: 1.29, crit: 0.67, intellect: 0.22, mp5: 0.08, spirit: 0.05 },
  },
  {
    id: "wrath-druid-balance", name: "Balance Druid", classId: 11, specName: "Balance", flavor: "wrath",
    description: `Assumes hit cap. ${WOWSIMS_WOTLK}.`,
    weights: { spell_power: 1, crit: 0.82, haste: 0.8, intellect: 0.43, spirit: 0.34 },
  },
  {
    id: "wrath-druid-cat", name: "Feral Druid (cat)", classId: 11, specName: "Feral", flavor: "wrath",
    description: WOWSIMS_WOTLK + ".",
    weights: { hit: 2.51, expertise: 2.44, strength: 2.4, agility: 2.39, crit: 2.23, armor_penetration: 2.08, haste: 1.83, attack_power: 1, weapon_dps: 16.5 },
  },
  {
    id: "wrath-druid-bear", name: "Feral Druid (bear)", classId: 11, specName: "Feral", flavor: "wrath",
    description: `Tank set. ${WOWSIMS_WOTLK}.`,
    weights: { stamina: 7.3, agility: 4.5, armor: 3.57, hit: 2.93, expertise: 2.66, strength: 2.38, haste: 2.1, dodge: 2.02, defense: 1.82, armor_penetration: 1.58, crit: 1.51, attack_power: 1 },
  },
  {
    id: "wrath-paladin-ret", name: "Retribution Paladin", classId: 2, specName: "Retribution", flavor: "wrath",
    description: WOWSIMS_WOTLK + ".",
    weights: { strength: 2.53, hit: 1.96, expertise: 1.8, haste: 1.44, crit: 1.16, agility: 1.13, attack_power: 1, armor_penetration: 0.76, spell_power: 0.32, weapon_dps: 7.33 },
  },
  {
    id: "wrath-paladin-prot", name: "Protection Paladin", classId: 2, specName: "Protection", flavor: "wrath",
    description: WOWSIMS_WOTLK + ".",
    weights: { stamina: 1.14, strength: 1, hit: 0.79, expertise: 0.69, agility: 0.62, parry: 0.61, defense: 0.54, block: 0.52, dodge: 0.46, crit: 0.3, block_value: 0.28, attack_power: 0.26 },
  },
  {
    id: "wrath-paladin-holy", name: "Holy Paladin", classId: 2, specName: "Holy", flavor: "wrath",
    description: PAWN_WOTLK + ".",
    weights: { intellect: 100, mp5: 88, spell_power: 58, crit: 46, haste: 35 },
  },
];
