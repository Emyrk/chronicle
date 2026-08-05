import { iconUrl } from "@/config/iconUrl";

export function formatClassLabel(cls: string): string {
  return cls.charAt(0) + cls.slice(1).toLowerCase();
}

export function formatRaceLabel(race: string): string {
  if (race === "NightElf") return "Night Elf";
  if (race === "BloodElf") return "Blood Elf";
  if (race === "Scourge") return "Undead";
  return race;
}

export function getClassIconUrl(cls: string): string {
  return `/c/icons/class_${cls.toLowerCase()}.png`;
}

export function getRaceIconUrl(race: string, gender: string, iconBaseUrl?: string): string {
  const name = race === "Scourge" ? "forsaken" : race.toLowerCase().replace(" ", "");
  if (gender == "Female") {
    return iconUrl(`inv_misc_head_${name}_02`, iconBaseUrl);
  }

  return iconUrl(`race_${name}`, iconBaseUrl);
}
