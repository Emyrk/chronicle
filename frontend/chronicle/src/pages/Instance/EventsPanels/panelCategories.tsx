/** The built-in panel catalog shared by the panel dropdown and the panel explorer. */

import { Leaf, Scale, Sword, Toolbox, User } from "lucide-react";
import { PANELS, type BuiltinPanelType, type EventsPanelType } from "./EventsPanel";

export interface PanelOption {
  value: EventsPanelType;
  label: string;
  icon: React.ReactNode;
  description?: string;
}

export interface PanelCategory {
  label: string;
  /** Direct panel items (leaf nodes) */
  items?: EventsPanelType[];
  /** Nested subcategories */
  subcategories?: PanelCategory[];
  /** Optional explicit icon (defaults to first item's icon) */
  icon?: React.ReactNode;
}

// Category organization - panels get their labels/icons from PANELS registry
export const PANEL_CATEGORIES: PanelCategory[] = [
  {
    label: "Damage",
    items: ["damage_done", "vulnerability_effect", "enemy_damage_done", "pet_damage_done", "damage_done_friendly_fire"],
  },
  {
    label: "Healing",
    items: ["healing_done", "healing_taken"],
  },
  {
    label: "Survivability",
    items: ["damage_taken", "enemy_damage_taken", "mitigation", "absorbed_damage", "resists"], // TODO: Add "avoidance" when spell school data is available
  },
  {
    label: "Resources",
    items: ["extra_attacks", "resource_regen", "consumables", "consumables_ledger", "cooldown_usage"],
  },
  {
    label: "Deaths",
    items: ["deaths", "death_log"],
  },
  {
    label: "Buffs",
    items: ["aura_uptime", "unit_auras", "friendly_class_buffs"],
  },
  {
    label: "Dispels & Interrupts",
    items: ["dispels_done", "dispels_received", "dispel_log", "interrupts", "interrupt_log"],
  },
  {
    label: "Class",
    // TODO: Make class icons in this style
    icon: <User className="h-4 w-4" />,
    subcategories: [
      {
        label: "Druid",
        items: ["innervate", "faerie_fire"],
        icon: <Leaf className="h-4 w-4" />,
      },
      {
        label: "Warrior",
        items: ["sunder"],
        icon: <Sword className="h-4 w-4" />,
      },
      {
        label: "Paladin",
        items: ["judgement"],
        icon: <Scale className="h-4 w-4" />,
      },
    ],
  },
  {
    label: "Replay",
    items: ["map", "mini_map", "raid_frames", "activity_log", "status", "healer_casts"],
  },
  {
    label: "Utility",
    items: ["roles", "raid_composition", "timeline", "rotations", "spell_count", "comparison", "all_activity", "metrics", "periods", "pulls_and_cleanup", "possession", "vehicle", "unit_lookup", "equipment", "guilds", "loot", "logging_metadata", "companion_stats", "leaderboard", "ranking_records", "empty"],
    icon: <Toolbox className="h-4 w-4" />,
  },
];

// One line each for the panel explorer's cards; search matches against these too.
const PANEL_DESCRIPTIONS: Partial<Record<BuiltinPanelType, string>> = {
  damage_done: "Damage dealt by players, with ability and target breakdowns.",
  vulnerability_effect: "Extra damage from vulnerability debuffs on targets.",
  enemy_damage_done: "Damage dealt by enemies.",
  pet_damage_done: "Damage dealt by pets and guardians.",
  damage_done_friendly_fire: "Damage players and pets dealt to friendlies.",
  healing_done: "Healing done by players, including overhealing.",
  healing_taken: "Healing each player received, and from whom.",
  damage_taken: "Damage players took, by ability and source.",
  enemy_damage_taken: "Damage each enemy took.",
  mitigation: "Damage avoided by dodges, parries, blocks and misses.",
  absorbed_damage: "Damage absorbed by shields, by caster and target.",
  resists: "Full and partial spell resists.",
  extra_attacks: "Extra attack procs like Windfury and Hand of Justice.",
  resource_regen: "Mana, rage, energy and health gained, by source.",
  consumables: "A timestamped log of every consumable used.",
  consumables_ledger: "Potions, flasks and other consumables used per player.",
  cooldown_usage: "When players used their major cooldowns.",
  deaths: "Who died and how often.",
  death_log: "The events leading up to each death.",
  aura_uptime: "How long buffs and debuffs were up.",
  unit_auras: "Every aura on a chosen unit over time.",
  friendly_class_buffs: "Which class buffs each player had.",
  dispels_done: "Dispels cast, by player and aura.",
  dispels_received: "Dispels each unit received.",
  dispel_log: "A timestamped log of every dispel.",
  interrupts: "Spell interrupts, by player and spell.",
  interrupt_log: "A timestamped log of every interrupt.",
  innervate: "Innervate casts and the mana they returned.",
  faerie_fire: "Faerie Fire uptime on bosses.",
  sunder: "Sunder Armor casts and stacks.",
  judgement: "Judgement uptime on bosses.",
  map: "A 3D replay of positions over the fight.",
  mini_map: "A compact overhead replay map.",
  raid_frames: "Raid frames replayed in sync with the fight.",
  activity_log: "A scrolling feed of events at the replay time.",
  status: "Each unit's state at the replay time.",
  healer_casts: "Healer cast bars replayed over time.",
  roles: "Inferred tank, healer and damage roles.",
  raid_composition: "The raid's classes and roles.",
  timeline: "Charts of events over time, with filters.",
  rotations: "Each player's casts laid out on a timeline.",
  spell_count: "How many times each spell was cast.",
  comparison: "Compare values from other panels side by side.",
  all_activity: "Every raw event, for debugging.",
  metrics: "Panel timing and processing diagnostics.",
  periods: "When enemies were active across encounters.",
  pulls_and_cleanup: "Pull and cleanup times for each encounter.",
  possession: "Mind control and possession intervals.",
  vehicle: "When units controlled vehicles.",
  unit_lookup: "Look up any unit in the log.",
  equipment: "Gear each player wore.",
  guilds: "Guilds represented in the raid.",
  loot: "Items looted during the raid.",
  logging_metadata: "Log versions and recorder details.",
  companion_stats: "Stats reported by the companion addon.",
  leaderboard: "How this clear ranks on the speedrun leaderboards.",
  ranking_records: "The DPS and HPS ranking rows recorded for this log.",
  empty: "A blank panel.",
};

// Build panel options from registry
export function getPanelOption(value: EventsPanelType): PanelOption {
  const panel = PANELS[value];
  return {
    value,
    label: panel?.label ?? value,
    icon: panel?.icon,
    description: PANEL_DESCRIPTIONS[value as BuiltinPanelType],
  };
}

const RECENT_PANELS_KEY = "panel-recent";
const RECENT_PANELS_LIMIT = 8;

/** Panels this viewer picked lately, newest first. */
export function readRecentPanels(): EventsPanelType[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(RECENT_PANELS_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is EventsPanelType => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function rememberRecentPanel(value: EventsPanelType) {
  try {
    const next = [value, ...readRecentPanels().filter((candidate) => candidate !== value)].slice(0, RECENT_PANELS_LIMIT);
    localStorage.setItem(RECENT_PANELS_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private windows, blocked site data); recents are a convenience.
  }
}

// Get category icon: explicit icon, first item's icon, or first subcategory's icon
export function getCategoryIcon(category: PanelCategory): React.ReactNode {
  if (category.icon) return category.icon;
  if (category.items && category.items.length > 0) {
    const firstPanel = PANELS[category.items[0]];
    return firstPanel?.icon;
  }
  if (category.subcategories && category.subcategories.length > 0) {
    return getCategoryIcon(category.subcategories[0]);
  }
  return null;
}

// Count total items in a category (including nested)
export function getCategoryItemCount(category: PanelCategory): number {
  let count = category.items?.length ?? 0;
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      count += getCategoryItemCount(sub);
    }
  }
  return count;
}

// Get all items from a category recursively (for search)
export function getAllCategoryItems(category: PanelCategory): { panelKey: EventsPanelType; categoryPath: string }[] {
  const results: { panelKey: EventsPanelType; categoryPath: string }[] = [];
  if (category.items) {
    for (const panelKey of category.items) {
      results.push({ panelKey, categoryPath: category.label });
    }
  }
  if (category.subcategories) {
    for (const sub of category.subcategories) {
      const subItems = getAllCategoryItems(sub);
      for (const item of subItems) {
        results.push({
          panelKey: item.panelKey,
          categoryPath: `${category.label} › ${item.categoryPath}`,
        });
      }
    }
  }
  return results;
}

/**
 * Simple fuzzy match - checks if all characters in pattern appear in str in order
 */
export function fuzzyMatch(pattern: string, str: string): { match: boolean; score: number } {
  const patternLower = pattern.toLowerCase();
  const strLower = str.toLowerCase();

  if (patternLower.length === 0) return { match: true, score: 0 };

  let patternIdx = 0;
  let score = 0;
  let consecutiveBonus = 0;

  for (let i = 0; i < strLower.length && patternIdx < patternLower.length; i++) {
    if (strLower[i] === patternLower[patternIdx]) {
      // Bonus for consecutive matches
      score += 1 + consecutiveBonus;
      consecutiveBonus += 1;
      // Bonus for matching at word start
      if (i === 0 || str[i - 1] === " ") {
        score += 2;
      }
      patternIdx++;
    } else {
      consecutiveBonus = 0;
    }
  }

  return {
    match: patternIdx === patternLower.length,
    score,
  };
}
