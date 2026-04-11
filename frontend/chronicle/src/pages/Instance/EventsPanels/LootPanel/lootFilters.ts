/**
 * Instance-specific loot filters.
 *
 * Each instance can define one or more named filter groups.
 * Filters are enabled by default — matching items are hidden unless
 * the user toggles the filter off.
 *
 * To add filters for an instance:
 *   1. Add an entry keyed by the exact instance name (e.g. "Molten Core").
 *   2. Each filter has a `label` (shown as a toggle badge) and `itemIds` to hide.
 *   3. An instance can have multiple filters (e.g. "Trash BoEs", "Crafting Mats").
 */

export interface InstanceLootFilter {
  /** Display label for the toggle badge */
  label: string;
  /** Item IDs to hide when this filter is active */
  itemIds: Set<number>;
}

/**
 * Shared filters applied to all instances.
 */
const GLOBAL_FILTERS: InstanceLootFilter[] = [
  {
    label: "Rare/Epic Crafting Materials",
    itemIds: new Set([
      // Molten Core
      17010, // Fiery Core
      17011, // Lava Core
      11382, // Blood of the Mountain
      17012, // Core Leather
      // Blackwing Lair
      18562, // Elementium Ore
      // Naxxramas
      22682, // Frozen Rune
      // Ahn'Qiraj
      21229, // Qiraji Bindings of Command
      21230, // Qiraji Bindings of Dominance
      21232, // Imperial Qiraji Armaments
      21237, // Imperial Qiraji Regalia
      // Enchanting materials
      10978, // Small Glimmering Shard
      11084, // Large Glimmering Shard
      11138, // Small Glowing Shard
      11139, // Large Glowing Shard 
      11177, // Small Radiant Shard
      11178, // Large Radiant Shard
      14343, // Small Brilliant Shard
      14344, // Large Brilliant Shard
      20725, // Nexus Crystal
    ]),
  },
];

/**
 * Instance-specific filters (in addition to the global ones).
 *
 * Add new entries here as needed — the loot panel picks them up automatically.
 */
const INSTANCE_LOOT_FILTERS: Record<string, InstanceLootFilter[]> = {
  "Zul'Gurub": [
    {
      label: "Currency",
      itemIds: new Set([
        19701, // Gurubashi Coin
        19702, // Vilebranch Coin
        19703, // Witherbark Coin
        19704, // Sandfury Coin
        19705, // Skullsplitter Coin
        19706, // Bloodscalp Coin
        19698, // Zulian Coin
        19699, // Razzashi Coin
        19700, // Hakkari Coin

        19708, // Blue Hakkari Bijou
        19713, // Bronze Hakkari Bijou
        19715, // Gold Hakkari Bijou
        19711, // Green Hakkari Bijou
        19710, // Orange Hakkari Bijou
        19712, // Purple Hakkari Bijou
        19707, // Red Hakkari Bijou
        19714, // Silver Hakkari Bijou
        19709, // Yellow Hakkari Bijou
      ]),
    },
  ],
  "Naxxramas": [
    {
      label: "Currency",
      itemIds: new Set([
        22374, // Wartorn Chain Scrap
        22376, // Wartorn Cloth Scrap
        22373, // Wartorn Leather Scrap
        22375, // Wartorn Plate Scrap
      ]),
    },
  ],
};

/**
 * Get loot filters applicable to the given instance name.
 * Returns global filters followed by any instance-specific ones.
 */
export function getInstanceLootFilters(instanceName: string): InstanceLootFilter[] {
  return [...GLOBAL_FILTERS, ...(INSTANCE_LOOT_FILTERS[instanceName] ?? [])];
}

// ── Turnin / Currency items ─────────────────────────────────────────────────
// Defines groups of "currency-like" items per instance that get summarized
// into a per-player count table. Only instances with turnin config show the tab.

export interface TurninGroup {
  /** Display label for this group (e.g. "Coins", "Bijous") */
  label: string;
  /** Item IDs in this group */
  itemIds: Set<number>;
}

export interface InstanceTurninConfig {
  /** Tab label shown in the panel (e.g. "Turnins") */
  tabLabel: string;
  /** Groups of items to summarize */
  groups: TurninGroup[];
}

const INSTANCE_TURNINS: Record<string, InstanceTurninConfig> = {
  "Zul'Gurub": {
    tabLabel: "Turnins",
    groups: [
      {
        label: "Coins",
        itemIds: new Set([
          19701, // Gurubashi Coin
          19702, // Vilebranch Coin
          19703, // Witherbark Coin
          19704, // Sandfury Coin
          19705, // Skullsplitter Coin
          19706, // Bloodscalp Coin
          19698, // Zulian Coin
          19699, // Razzashi Coin
          19700, // Hakkari Coin
        ]),
      },
      {
        label: "Bijous",
        itemIds: new Set([
          19708, // Blue Hakkari Bijou
          19713, // Bronze Hakkari Bijou
          19715, // Gold Hakkari Bijou
          19711, // Green Hakkari Bijou
          19710, // Orange Hakkari Bijou
          19712, // Purple Hakkari Bijou
          19707, // Red Hakkari Bijou
          19714, // Silver Hakkari Bijou
          19709, // Yellow Hakkari Bijou
        ]),
      },
    ],
  },
  "Naxxramas": {
    tabLabel: "Turnins",
    groups: [
      {
        label: "Wartorn Scraps",
        itemIds: new Set([
          22374, // Wartorn Chain Scrap
          22376, // Wartorn Cloth Scrap
          22373, // Wartorn Leather Scrap
          22375, // Wartorn Plate Scrap
        ]),
      },
    ],
  },
};

/**
 * Get turnin config for a given instance. Returns null if none configured.
 */
export function getInstanceTurninConfig(instanceName: string): InstanceTurninConfig | null {
  return INSTANCE_TURNINS[instanceName] ?? null;
}

