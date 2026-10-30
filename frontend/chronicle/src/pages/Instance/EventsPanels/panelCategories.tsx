/** The built-in panel catalog shared by the panel dropdown and the panel explorer. */

import { Leaf, Scale, Sword, Toolbox, User } from "lucide-react";
import { PANELS, type EventsPanelType } from "./EventsPanel";

export interface PanelOption {
  value: EventsPanelType;
  label: string;
  icon: React.ReactNode;
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

// Build panel options from registry
export function getPanelOption(value: EventsPanelType): PanelOption {
  const panel = PANELS[value];
  return {
    value,
    label: panel?.label ?? value,
    icon: panel?.icon,
  };
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
