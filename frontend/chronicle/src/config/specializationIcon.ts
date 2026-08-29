function iconNamePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns the bundled specialization icon from the Wow-Icons set:
 * https://github.com/orourkek/Wow-Icons
 */
export function specializationIconUrl(heroClass: string, specialization: string): string {
  return `/c/icons/spec_${iconNamePart(heroClass)}_${iconNamePart(specialization)}.png`;
}

export function specializationIconUrlForClassID(
  classID: number,
  specialization: string,
): string | null {
  const heroClass = CLASS_NAMES[classID];
  return heroClass ? specializationIconUrl(heroClass, specialization) : null;
}

export const CLASS_NAMES: Record<number, string> = {
  1: "Warrior",
  2: "Paladin",
  3: "Hunter",
  4: "Rogue",
  5: "Priest",
  6: "Death Knight",
  7: "Shaman",
  8: "Mage",
  9: "Warlock",
  11: "Druid",
};
