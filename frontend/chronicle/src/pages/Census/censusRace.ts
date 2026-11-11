type Faction = "Horde" | "Alliance" | "Unknown";

const NIGHTMARE_OF_URSOL_FLAVOR = "nightmare-of-ursol";

const RACE_TO_FACTION: Record<string, Faction> = {
  Orc: "Horde",
  Troll: "Horde",
  Tauren: "Horde",
  Scourge: "Horde",
  Goblin: "Horde",
  Human: "Alliance",
  Dwarf: "Alliance",
  Gnome: "Alliance",
  NightElf: "Alliance",
  Draenei: "Alliance",
  Skyborne: "Unknown",
  Unknown: "Unknown",
};

const RACE_DISPLAY: Record<string, string> = {
  NightElf: "Night Elf",
  BloodElf: "Blood Elf",
  Scourge: "Undead",
};

export function raceFaction(
  race: string,
  flavor: readonly string[],
  explicitFaction?: string,
): Faction {
  if (explicitFaction === "Alliance" || explicitFaction === "Horde") {
    return explicitFaction;
  }
  if (race === "BloodElf") {
    return flavor.includes(NIGHTMARE_OF_URSOL_FLAVOR) ? "Alliance" : "Horde";
  }
  return RACE_TO_FACTION[race] ?? "Unknown";
}

export function raceName(race: string, flavor: readonly string[]): string {
  if (race === "BloodElf" && flavor.includes(NIGHTMARE_OF_URSOL_FLAVOR)) {
    return "High Elf";
  }
  return RACE_DISPLAY[race] ?? race;
}
