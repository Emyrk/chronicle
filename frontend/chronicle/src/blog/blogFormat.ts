import type { BlogRarity } from "./blogRegistry";

export function formatPublishedDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[(month ?? 1) - 1]} ${day}, ${year}`;
}

export const RARITY_LABELS: Record<BlogRarity, string> = {
  legendary: "Legendary",
  epic: "Epic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};

// WoW item quality colors. These mirror --color-quality-* in index.css, but are
// inlined because Tailwind only emits theme variables that a utility class uses.
const RARITY_COLORS: Record<BlogRarity, string> = {
  legendary: "#ff8000",
  epic: "#a335ee",
  rare: "#0070dd",
  uncommon: "#1eff00",
  common: "#ffffff",
};

export function rarityColor(rarity: BlogRarity): string {
  return RARITY_COLORS[rarity];
}

/** Legendary and epic drops get a soft glow, matching how big the update is. */
export function rarityGlow(rarity: BlogRarity): string | undefined {
  if (rarity !== "legendary" && rarity !== "epic") {
    return undefined;
  }
  const color = rarityColor(rarity);
  return `0 0 28px color-mix(in srgb, ${color} 20%, transparent), inset 0 0 40px color-mix(in srgb, ${color} 5%, transparent)`;
}
