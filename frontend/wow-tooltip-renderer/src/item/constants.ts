// Item tooltip lookup tables. These are static game data (identical across
// servers) previously duplicated between ItemTooltip and ItemSetDetailPage.

export const BONDING_TEXT: Record<number, string> = {
  1: "Binds when picked up",
  2: "Binds when equipped",
  3: "Binds when used",
  4: "Quest Item",
};

export const INVENTORY_TYPE_TEXT: Record<number, string> = {
  1: "Head",
  2: "Neck",
  3: "Shoulder",
  4: "Shirt",
  5: "Chest",
  6: "Waist",
  7: "Legs",
  8: "Feet",
  9: "Wrist",
  10: "Hands",
  11: "Finger",
  12: "Trinket",
  13: "One-Hand",
  14: "Shield",
  15: "Ranged",
  16: "Back",
  17: "Two-Hand",
  18: "Bag",
  19: "Tabard",
  20: "Robe",
  21: "Main Hand",
  22: "Off Hand",
  23: "Holdable",
  24: "Ammo",
  25: "Thrown",
  26: "Ranged",
  28: "Relic",
};

// Keyed by "class-subclass" (e.g. "2-0" = Weapon/Axe, "4-1" = Armor/Cloth).
export const ITEM_CLASS_TEXT: Record<string, string> = {
  "2-0": "Axe",
  "2-1": "Axe",
  "2-2": "Bow",
  "2-3": "Gun",
  "2-4": "Mace",
  "2-5": "Mace",
  "2-6": "Polearm",
  "2-7": "Sword",
  "2-8": "Sword",
  "2-9": "Obsolete",
  "2-10": "Staff",
  "2-13": "Fist Weapon",
  "2-14": "Miscellaneous",
  "2-15": "Dagger",
  "2-16": "Thrown",
  "2-17": "Spear",
  "2-18": "Crossbow",
  "2-19": "Wand",
  "2-20": "Fishing Pole",
  "4-0": "Miscellaneous",
  "4-1": "Cloth",
  "4-2": "Leather",
  "4-3": "Mail",
  "4-4": "Plate",
  "4-6": "Shield",
  "4-7": "Libram",
  "4-8": "Idol",
  "4-9": "Totem",
  "4-10": "Sigil",
};

export interface StatDisplay {
  /** Format the stat value into its tooltip line. */
  format: (value: number) => string;
  /** True for combat-rating "Equip:" lines (rendered green), false for base attributes (white). */
  green: boolean;
}

// Stat type ID -> display formatter. White = base attributes, green = combat ratings.
export const STAT_DISPLAY: Record<number, StatDisplay> = {
  0: { format: (v) => `+${v} Mana`, green: false },
  1: { format: (v) => `+${v} Health`, green: false },
  3: { format: (v) => `+${v} Agility`, green: false },
  4: { format: (v) => `+${v} Strength`, green: false },
  5: { format: (v) => `+${v} Intellect`, green: false },
  6: { format: (v) => `+${v} Spirit`, green: false },
  7: { format: (v) => `+${v} Stamina`, green: false },
  12: { format: (v) => `Equip: Increases defense rating by ${v}.`, green: true },
  13: { format: (v) => `Equip: Increases your dodge rating by ${v}.`, green: true },
  14: { format: (v) => `Equip: Increases your parry rating by ${v}.`, green: true },
  15: { format: (v) => `Equip: Increases your shield block rating by ${v}.`, green: true },
  31: { format: (v) => `Equip: Improves hit rating by ${v}.`, green: true },
  32: { format: (v) => `Equip: Improves critical strike rating by ${v}.`, green: true },
  35: { format: (v) => `Equip: Improves your resilience rating by ${v}.`, green: true },
  36: { format: (v) => `Equip: Improves haste rating by ${v}.`, green: true },
  37: { format: (v) => `Equip: Increases your expertise rating by ${v}.`, green: true },
  38: { format: (v) => `Equip: Increases attack power by ${v}.`, green: true },
  39: { format: (v) => `Equip: Increases ranged attack power by ${v}.`, green: true },
  41: { format: (v) => `Equip: Increases healing done by spells and effects by up to ${v}.`, green: true },
  42: { format: (v) => `Equip: Increases damage and healing done by magical spells and effects by up to ${v}.`, green: true },
  43: { format: (v) => `Equip: Restores ${v} mana per 5 sec.`, green: true },
  44: { format: (v) => `Equip: Increases armor penetration rating by ${v}.`, green: true },
  45: { format: (v) => `Equip: Increases spell power by ${v}.`, green: true },
  46: { format: (v) => `Equip: Restores ${v} health per 5 sec.`, green: true },
  47: { format: (v) => `Equip: Increases spell penetration by ${v}.`, green: true },
  48: { format: (v) => `Equip: Increases the block value of your shield by ${v}.`, green: true },
};

// Socket color bitmask -> label + hex color. Image assets are app-owned (the
// renderer never references file paths).
export interface SocketInfo {
  label: string;
  color: string; // hex
}

export const SOCKET_INFO: Record<number, SocketInfo> = {
  1: { label: "Meta Socket", color: "#c0c0c0" },
  2: { label: "Red Socket", color: "#ff4040" },
  4: { label: "Yellow Socket", color: "#ffd100" },
  8: { label: "Blue Socket", color: "#4080ff" },
};

export const SPELL_TRIGGER_TEXT: Record<number, string> = {
  0: "Use:",
  1: "Equip:",
  2: "Chance on hit:",
};

export const SKILL_LABELS: Record<number, string> = {
  129: "First Aid",
  164: "Blacksmithing",
  165: "Leatherworking",
  171: "Alchemy",
  185: "Cooking",
  186: "Mining",
  197: "Tailoring",
  202: "Engineering",
  333: "Enchanting",
  356: "Fishing",
};
