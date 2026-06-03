// Item quality (rarity) colors as hex values. Consumers map these to their own
// styling (Tailwind classes, inline styles, etc.). Hex keeps the package free of
// any CSS framework assumptions.

export const QUALITY = {
  Poor: 0,
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  Epic: 4,
  Legendary: 5,
  Artifact: 6,
} as const;

export const QUALITY_LABELS: Record<number, string> = {
  0: "Poor",
  1: "Common",
  2: "Uncommon",
  3: "Rare",
  4: "Epic",
  5: "Legendary",
  6: "Artifact",
};

/** Quality level -> hex color (matches Chronicle's --color-quality-* tokens). */
export const QUALITY_COLORS: Record<number, string> = {
  0: "#9d9d9d", // Poor (gray)
  1: "#ffffff", // Common (white)
  2: "#1eff00", // Uncommon (green)
  3: "#0070dd", // Rare (blue)
  4: "#a335ee", // Epic (purple)
  5: "#ff8000", // Legendary (orange)
  6: "#e6cc80", // Artifact (gold)
};

/** Return the hex color for a quality level, defaulting to Common (white). */
export function getQualityColor(quality: number): string {
  return QUALITY_COLORS[quality] ?? QUALITY_COLORS[1];
}
