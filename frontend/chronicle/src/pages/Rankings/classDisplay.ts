import type { WoWHeroClasses } from "@/api/typesGenerated"

export const CLASS_DISPLAY: Record<string, string> = {
  WARRIOR: "Warrior",
  ROGUE: "Rogue",
  MAGE: "Mage",
  WARLOCK: "Warlock",
  HUNTER: "Hunter",
  PRIEST: "Priest",
  DRUID: "Druid",
  PALADIN: "Paladin",
  SHAMAN: "Shaman",
  DEATHKNIGHT: "Death Knight",
  UNKNOWN: "Unknown",
}

export const CLASS_CSS_VAR: Record<string, string> = {
  WARRIOR: "var(--color-class-warrior)",
  ROGUE: "var(--color-class-rogue)",
  MAGE: "var(--color-class-mage)",
  WARLOCK: "var(--color-class-warlock)",
  HUNTER: "var(--color-class-hunter)",
  PRIEST: "var(--color-class-priest)",
  DRUID: "var(--color-class-druid)",
  PALADIN: "var(--color-class-paladin)",
  SHAMAN: "var(--color-class-shaman)",
  DEATHKNIGHT: "var(--color-class-deathknight)",
  UNKNOWN: "var(--color-class-unknown)",
}

export const ALL_DPS_CLASSES: WoWHeroClasses[] = [
  "WARRIOR", "ROGUE", "MAGE", "WARLOCK", "HUNTER",
  "PRIEST", "DRUID", "PALADIN", "SHAMAN",
]

export const SPEC_BY_CLASS: Record<string, readonly string[]> = {
  WARRIOR: ["Arms", "Fury", "Protection"],
  ROGUE: ["Assassination", "Combat", "Subtlety"],
  MAGE: ["Arcane", "Fire", "Frost"],
  WARLOCK: ["Affliction", "Demonology", "Destruction"],
  HUNTER: ["Beast Mastery", "Marksmanship", "Survival"],
  PRIEST: ["Discipline", "Holy", "Shadow"],
  DRUID: ["Balance", "Feral", "Restoration"],
  PALADIN: ["Holy", "Protection", "Retribution"],
  SHAMAN: ["Elemental", "Enhancement", "Restoration"],
}

export const REALM_NAMES = ["Ambershire", "Tel'Abim", "Nordanaar"] as const
