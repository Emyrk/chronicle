/**
 * Pure stat-weight scoring over SimItem payloads. No React imports.
 *
 * Weight sets are stored as JSON maps of { statKey: weight } — the keys
 * are the canonical STAT_KEYS below. Scores are item stats only: enchants
 * carry no decomposed stat data in the database and never affect scores.
 */
import type { SimItem } from "@/api/typesGenerated";

export type StatWeights = Record<string, number>;

export interface StatKeyDef {
  key: string;
  label: string;
  group: "Attributes" | "Combat" | "Spell" | "Defense" | "Resistance" | "Weapon";
  /** item_template stat_type this key reads, if it is a plain stat. */
  itemMod?: number;
}

/**
 * Canonical stat registry. `itemMod` values follow the mangos
 * item_template stat_type enum used by world_item_template.
 */
export const STAT_KEYS: readonly StatKeyDef[] = [
  { key: "strength", label: "Strength", group: "Attributes", itemMod: 4 },
  { key: "agility", label: "Agility", group: "Attributes", itemMod: 3 },
  { key: "stamina", label: "Stamina", group: "Attributes", itemMod: 7 },
  { key: "intellect", label: "Intellect", group: "Attributes", itemMod: 5 },
  { key: "spirit", label: "Spirit", group: "Attributes", itemMod: 6 },
  { key: "health", label: "Health", group: "Attributes", itemMod: 1 },
  { key: "mana", label: "Mana", group: "Attributes", itemMod: 0 },

  { key: "attack_power", label: "Attack power", group: "Combat", itemMod: 38 },
  { key: "ranged_attack_power", label: "Ranged attack power", group: "Combat", itemMod: 39 },
  { key: "hit", label: "Hit", group: "Combat", itemMod: 31 },
  { key: "crit", label: "Crit", group: "Combat", itemMod: 32 },
  { key: "haste", label: "Haste", group: "Combat", itemMod: 36 },
  { key: "expertise", label: "Expertise", group: "Combat", itemMod: 37 },
  { key: "armor_penetration", label: "Armor penetration", group: "Combat", itemMod: 44 },

  { key: "spell_power", label: "Spell power", group: "Spell", itemMod: 45 },
  { key: "spell_damage", label: "Spell damage", group: "Spell", itemMod: 42 },
  { key: "healing", label: "Healing power", group: "Spell", itemMod: 41 },
  { key: "mp5", label: "Mana per 5", group: "Spell", itemMod: 43 },
  { key: "spell_penetration", label: "Spell penetration", group: "Spell", itemMod: 47 },

  { key: "defense", label: "Defense", group: "Defense", itemMod: 12 },
  { key: "dodge", label: "Dodge", group: "Defense", itemMod: 13 },
  { key: "parry", label: "Parry", group: "Defense", itemMod: 14 },
  { key: "block", label: "Block", group: "Defense", itemMod: 15 },
  { key: "block_value", label: "Block value", group: "Defense", itemMod: 48 },
  { key: "armor", label: "Armor", group: "Defense" },

  { key: "resist_holy", label: "Holy resist", group: "Resistance" },
  { key: "resist_fire", label: "Fire resist", group: "Resistance" },
  { key: "resist_nature", label: "Nature resist", group: "Resistance" },
  { key: "resist_frost", label: "Frost resist", group: "Resistance" },
  { key: "resist_shadow", label: "Shadow resist", group: "Resistance" },
  { key: "resist_arcane", label: "Arcane resist", group: "Resistance" },

  { key: "weapon_dps", label: "Weapon DPS", group: "Weapon" },
] as const;

export const STAT_GROUPS = ["Attributes", "Combat", "Spell", "Defense", "Resistance", "Weapon"] as const;

const MOD_TO_KEY = new Map<number, string>(
  STAT_KEYS.filter((s) => s.itemMod !== undefined).map((s) => [s.itemMod!, s.key]),
);

/** Resistance array order on SimItem: [holy,fire,nature,frost,shadow,arcane]. */
const RESIST_KEYS = [
  "resist_holy",
  "resist_fire",
  "resist_nature",
  "resist_frost",
  "resist_shadow",
  "resist_arcane",
] as const;

/** Average weapon DPS from the item's damage ranges and swing delay. */
export function weaponDps(item: SimItem): number {
  if (!item.damage || item.damage.length === 0 || item.delay <= 0) return 0;
  const avg = item.damage.reduce((sum, d) => sum + (d.min + d.max) / 2, 0);
  return avg / (item.delay / 1000);
}

/**
 * Extract the item's stats as a { statKey: value } map. Unknown stat_type
 * values are ignored.
 */
export function itemStatValues(item: SimItem): StatWeights {
  const out: StatWeights = {};
  for (const stat of item.stats ?? []) {
    const key = MOD_TO_KEY.get(stat.type);
    if (key && stat.value !== 0) out[key] = (out[key] ?? 0) + stat.value;
  }
  if (item.armor > 0) out.armor = item.armor;
  item.resistances?.forEach((value, i) => {
    if (value > 0) out[RESIST_KEYS[i]] = value;
  });
  const dps = weaponDps(item);
  if (dps > 0) out.weapon_dps = dps;
  return out;
}

/** Weighted score for one item. Unknown weight keys are ignored. */
export function scoreItem(item: SimItem, weights: StatWeights): number {
  const values = itemStatValues(item);
  let score = 0;
  for (const [key, value] of Object.entries(values)) {
    const w = weights[key];
    if (w) score += value * w;
  }
  return score;
}

/** Total score over a set of items (e.g. every filled slot of a stage). */
export function scoreItems(items: SimItem[], weights: StatWeights): number {
  return items.reduce((sum, item) => sum + scoreItem(item, weights), 0);
}

/** Parse a stat-weight jsonb payload; non-numeric entries are dropped. */
export function parseWeights(raw: unknown): StatWeights {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  const out: StatWeights = {};
  for (const [key, v] of Object.entries(value)) {
    if (typeof v === "number" && Number.isFinite(v) && v !== 0) out[key] = v;
  }
  return out;
}

/** Weight keys that are not in the canonical registry (shown as a hint). */
export function unknownWeightKeys(weights: StatWeights): string[] {
  const known = new Set(STAT_KEYS.map((s) => s.key));
  return Object.keys(weights).filter((k) => !known.has(k));
}

export function formatScore(score: number): string {
  return score >= 100 ? String(Math.round(score)) : score.toFixed(1);
}
