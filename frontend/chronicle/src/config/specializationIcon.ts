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
