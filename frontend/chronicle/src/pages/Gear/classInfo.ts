import { CLASS_DISPLAY, CLASS_NAME_TO_ID, SPEC_BY_CLASS } from "@/pages/Rankings/classDisplay";

export interface GearClassInfo {
  /** WoW numeric class ID (1 = Warrior, ... 11 = Druid). */
  id: number;
  /** Enum-style name matching WoWHeroClasses ("WARRIOR"). */
  enumName: string;
  /** Display name ("Warrior"). */
  name: string;
  /** Spec display names for this class. */
  specs: readonly string[];
}

/** All playable classes in numeric-ID order. Death Knight last since most datasets are vanilla. */
export const GEAR_CLASSES: GearClassInfo[] = Object.entries(CLASS_NAME_TO_ID)
  .map(([enumName, id]) => ({
    id,
    enumName,
    name: CLASS_DISPLAY[enumName] ?? enumName,
    specs: SPEC_BY_CLASS[enumName] ?? [],
  }))
  .sort((a, b) => a.id - b.id);

/** Classes available for a dataset flavor list (Death Knight is wrath-only). */
export function gearClassesForFlavor(flavor: readonly string[]): GearClassInfo[] {
  if (flavor.includes("wrath")) return GEAR_CLASSES;
  return GEAR_CLASSES.filter((c) => c.enumName !== "DEATHKNIGHT");
}

export function gearClassById(id: number): GearClassInfo | undefined {
  return GEAR_CLASSES.find((c) => c.id === id);
}
