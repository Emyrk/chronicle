/**
 * Pure stat-weight scoring over SimItem payloads. No React imports.
 *
 * Weight sets are stored as JSON maps of { statKey: weight } — the keys
 * are the canonical STAT_KEYS below. Scores are item stats only: enchants
 * carry no decomposed stat data in the database and never affect scores.
 */
import type { SimItem } from "@/api/typesGenerated";

export type StatWeights = Record<string, number>;

export type StatTargetType = "minimum" | "maximum";

/** A raw-stat constraint stored alongside a profile's weights. */
export interface StatTarget {
  stat: string;
  type: StatTargetType;
  value: number;
}

export interface TargetEvaluation extends StatTarget {
  actual: number;
  met: boolean;
  difference: number;
}

export interface StatKeyDef {
  key: string;
  label: string;
  group:
    | "Attributes"
    | "Combat"
    | "Spell"
    | "Defense"
    | "Resistance"
    | "Weapon";
  /** item_template stat_type values this key reads, if it is a plain stat. */
  itemMods?: readonly number[];
}

/**
 * Canonical stat registry. `itemMod` values follow the mangos
 * item_template stat_type enum used by world_item_template.
 */
export const STAT_KEYS: readonly StatKeyDef[] = [
  { key: "strength", label: "Strength", group: "Attributes", itemMods: [4] },
  { key: "agility", label: "Agility", group: "Attributes", itemMods: [3] },
  { key: "stamina", label: "Stamina", group: "Attributes", itemMods: [7] },
  { key: "intellect", label: "Intellect", group: "Attributes", itemMods: [5] },
  { key: "spirit", label: "Spirit", group: "Attributes", itemMods: [6] },
  { key: "health", label: "Health", group: "Attributes", itemMods: [1] },
  { key: "mana", label: "Mana", group: "Attributes", itemMods: [0] },

  { key: "attack_power", label: "Attack power", group: "Combat", itemMods: [38, 40] },
  {
    key: "ranged_attack_power",
    label: "Ranged attack power",
    group: "Combat",
    itemMods: [39],
  },
  // The split melee/ranged/spell ratings (16-21, 28-30) are used by
  // older game versions; the unified ratings are used by Wrath.
  { key: "hit", label: "Hit", group: "Combat", itemMods: [16, 17, 18, 31] },
  { key: "crit", label: "Crit", group: "Combat", itemMods: [19, 20, 21, 32] },
  { key: "haste", label: "Haste", group: "Combat", itemMods: [28, 29, 30, 36] },
  { key: "expertise", label: "Expertise", group: "Combat", itemMods: [37] },
  {
    key: "armor_penetration",
    label: "Armor penetration",
    group: "Combat",
    itemMods: [44],
  },

  // Spell damage (42) is the pre-Wrath equivalent of spell power (45).
  { key: "spell_power", label: "Spell power", group: "Spell", itemMods: [42, 45] },
  { key: "healing", label: "Healing power", group: "Spell", itemMods: [41] },
  { key: "mp5", label: "Mana per 5", group: "Spell", itemMods: [43] },
  {
    key: "spell_penetration",
    label: "Spell penetration",
    group: "Spell",
    itemMods: [47],
  },

  { key: "defense", label: "Defense", group: "Defense", itemMods: [12] },
  { key: "dodge", label: "Dodge", group: "Defense", itemMods: [13] },
  { key: "parry", label: "Parry", group: "Defense", itemMods: [14] },
  { key: "block", label: "Block", group: "Defense", itemMods: [15] },
  { key: "block_value", label: "Block value", group: "Defense", itemMods: [48] },
  { key: "armor", label: "Armor", group: "Defense" },

  { key: "resist_holy", label: "Holy resist", group: "Resistance" },
  { key: "resist_fire", label: "Fire resist", group: "Resistance" },
  { key: "resist_nature", label: "Nature resist", group: "Resistance" },
  { key: "resist_frost", label: "Frost resist", group: "Resistance" },
  { key: "resist_shadow", label: "Shadow resist", group: "Resistance" },
  { key: "resist_arcane", label: "Arcane resist", group: "Resistance" },

  { key: "weapon_dps", label: "Weapon DPS", group: "Weapon" },
] as const;

export const STAT_GROUPS = [
  "Attributes",
  "Combat",
  "Spell",
  "Defense",
  "Resistance",
  "Weapon",
] as const;

const LEGACY_WEIGHT_KEYS: Readonly<Record<string, string>> = {
  spell_damage: "spell_power",
};

const MOD_TO_KEY = new Map<number, string>(
  STAT_KEYS.flatMap((stat) =>
    (stat.itemMods ?? []).map((itemMod) => [itemMod, stat.key] as const),
  ),
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
  if (item.block > 0) {
    out.block_value = (out.block_value ?? 0) + item.block;
  }
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

/** Add raw stats across a set of items. */
export function aggregateItemStats(items: SimItem[]): StatWeights {
  const totals: StatWeights = {};
  for (const item of items) {
    for (const [key, value] of Object.entries(itemStatValues(item))) {
      totals[key] = (totals[key] ?? 0) + value;
    }
  }
  return totals;
}

/** Evaluate profile targets against raw stage totals. Targets do not affect score. */
export function evaluateTargets(
  totals: StatWeights,
  targets: readonly StatTarget[],
): TargetEvaluation[] {
  return targets.map((target) => {
    const actual = totals[target.stat] ?? 0;
    const difference = actual - target.value;
    return {
      ...target,
      actual,
      difference,
      met: target.type === "minimum" ? difference >= 0 : difference <= 0,
    };
  });
}

export function evaluateItemSwapTargets(
  totals: StatWeights,
  current: SimItem | undefined,
  candidate: SimItem,
  targets: readonly StatTarget[],
): TargetEvaluation[] {
  const next = { ...totals };
  if (current) {
    for (const [key, value] of Object.entries(itemStatValues(current)))
      next[key] = (next[key] ?? 0) - value;
  }
  for (const [key, value] of Object.entries(itemStatValues(candidate)))
    next[key] = (next[key] ?? 0) + value;
  return evaluateTargets(next, targets);
}

/** Parse a targets jsonb payload; malformed and unknown-stat entries are dropped. */
export function parseTargets(raw: unknown): StatTarget[] {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(value)) return [];
  const known = new Set(STAT_KEYS.map((stat) => stat.key));
  const targets: StatTarget[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    if (
      typeof candidate.stat !== "string" ||
      !known.has(candidate.stat) ||
      (candidate.type !== "minimum" && candidate.type !== "maximum") ||
      typeof candidate.value !== "number" ||
      !Number.isFinite(candidate.value)
    ) {
      continue;
    }
    targets.push({
      stat: candidate.stat,
      type: candidate.type,
      value: candidate.value,
    });
  }
  return targets;
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
  for (const [rawKey, v] of Object.entries(value)) {
    if (typeof v !== "number" || !Number.isFinite(v) || v === 0) continue;
    const key = LEGACY_WEIGHT_KEYS[rawKey] ?? rawKey;
    out[key] = (out[key] ?? 0) + v;
  }
  return out;
}

/** Weight keys that are not in the canonical registry (shown as a hint). */
export function unknownWeightKeys(weights: StatWeights): string[] {
  const known = new Set(STAT_KEYS.map((s) => s.key));
  return Object.keys(weights).filter((k) => !known.has(k));
}

export function formatScore(score: number): string {
  // Whole numbers stay clean ("23", "0"); small fractional scores keep
  // one decimal ("4.5"); large scores round.
  if (score >= 100) return String(Math.round(score));
  const rounded = Math.round(score * 10) / 10;
  return String(rounded);
}
