import type { ArmoryPlayer } from "@/api/typesGenerated";

export type { ArmoryPlayer };

/**
 * Gear slot definition for the paper-doll layout.
 * `outfitIndex` is the index into the PlayerOutfit[19] array.
 */
export interface GearSlotDef {
  outfitIndex: number;
  label: string;
}

/**
 * PlayerOutfit slot order (indices 0–18):
 *  0=Head, 1=Neck, 2=Shoulder, 3=Shirt, 4=Chest, 5=Waist, 6=Legs,
 *  7=Feet, 8=Wrist, 9=Hands, 10=Finger1, 11=Finger2, 12=Trinket1,
 *  13=Trinket2, 14=Back, 15=MainHand, 16=OffHand, 17=Ranged, 18=Tabard
 */

/** Left column slots (top to bottom) */
export const LEFT_SLOTS: GearSlotDef[] = [
  { outfitIndex: 0, label: "Head" },
  { outfitIndex: 1, label: "Neck" },
  { outfitIndex: 2, label: "Shoulder" },
  { outfitIndex: 14, label: "Back" },
  { outfitIndex: 4, label: "Chest" },
  { outfitIndex: 3, label: "Shirt" },
  { outfitIndex: 18, label: "Tabard" },
  { outfitIndex: 8, label: "Wrist" },
];

/** Right column slots (top to bottom) */
export const RIGHT_SLOTS: GearSlotDef[] = [
  { outfitIndex: 9, label: "Hands" },
  { outfitIndex: 5, label: "Waist" },
  { outfitIndex: 6, label: "Legs" },
  { outfitIndex: 7, label: "Feet" },
  { outfitIndex: 10, label: "Finger" },
  { outfitIndex: 11, label: "Finger" },
  { outfitIndex: 12, label: "Trinket" },
  { outfitIndex: 13, label: "Trinket" },
];

/** Bottom row slots */
export const BOTTOM_SLOTS: GearSlotDef[] = [
  { outfitIndex: 15, label: "Main Hand" },
  { outfitIndex: 16, label: "Off Hand" },
  { outfitIndex: 17, label: "Ranged" },
];

/** Maps a class name to the CSS variable */
export function getClassColorVar(cls: string): string {
  return `var(--color-class-${cls.toLowerCase()})`;
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
