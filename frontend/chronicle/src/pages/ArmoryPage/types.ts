import type { WoWHeroClasses, WoWHeroRaces, WoWHeroGender } from "@/api/typesGenerated";

export interface ArmoryPlayer {
  guid: string;
  realm_name: string;
  name: string;
  class: WoWHeroClasses;
  race: WoWHeroRaces;
  gender: WoWHeroGender;
  guild_name?: string;
  gear: ArmoryGearItem[];
  updated_at: string;
}

export interface ArmoryGearItem {
  item_id: number;
  enchant_id?: number;
  /** WoW inventory_type: 1=Head, 2=Neck, 3=Shoulder, etc. */
  slot: number;
  name: string;
  quality: number;
  icon: string;
}

/**
 * Gear slot definitions for the paper-doll layout.
 * Each slot has a WoW inventory_type and display label.
 */
export interface GearSlotDef {
  inventoryType: number;
  label: string;
}

/** Left column slots (top to bottom) */
export const LEFT_SLOTS: GearSlotDef[] = [
  { inventoryType: 1, label: "Head" },
  { inventoryType: 2, label: "Neck" },
  { inventoryType: 3, label: "Shoulder" },
  { inventoryType: 16, label: "Back" },
  { inventoryType: 5, label: "Chest" },
  { inventoryType: 4, label: "Shirt" },
  { inventoryType: 19, label: "Tabard" },
  { inventoryType: 9, label: "Wrist" },
];

/** Right column slots (top to bottom) */
export const RIGHT_SLOTS: GearSlotDef[] = [
  { inventoryType: 10, label: "Hands" },
  { inventoryType: 6, label: "Waist" },
  { inventoryType: 7, label: "Legs" },
  { inventoryType: 8, label: "Feet" },
  { inventoryType: 11, label: "Finger" },
  { inventoryType: 11, label: "Finger" },
  { inventoryType: 12, label: "Trinket" },
  { inventoryType: 12, label: "Trinket" },
];

/** Bottom row slots */
export const BOTTOM_SLOTS: GearSlotDef[] = [
  { inventoryType: 21, label: "Main Hand" },
  { inventoryType: 22, label: "Off Hand" },
  { inventoryType: 15, label: "Ranged" },
];

/** Maps WoWHeroClasses to the CSS variable suffix */
export function getClassColorVar(cls: WoWHeroClasses): string {
  return `var(--color-class-${cls.toLowerCase()})`;
}

/** Maps WoWHeroClasses to a Tailwind text-class-* utility */
export function getClassColorClass(cls: WoWHeroClasses): string {
  return `text-class-${cls.toLowerCase()}`;
}

/** Maps item quality number to the CSS variable */
export function getQualityColorVar(quality: number): string {
  const names: Record<number, string> = {
    0: "poor",
    1: "common",
    2: "uncommon",
    3: "rare",
    4: "epic",
    5: "legendary",
    6: "artifact",
  };
  return `var(--color-quality-${names[quality] ?? "common"})`;
}

/** Maps item quality number to a Tailwind border-quality-* utility */
export function getQualityBorderClass(quality: number): string {
  const names: Record<number, string> = {
    0: "border-quality-poor",
    1: "border-quality-common",
    2: "border-quality-uncommon",
    3: "border-quality-rare",
    4: "border-quality-epic",
    5: "border-quality-legendary",
    6: "border-quality-artifact",
  };
  return names[quality] ?? "border-quality-common";
}
