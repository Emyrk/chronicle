// Shared per-instance accent colors for guild page panels.

import type { CSSProperties } from "react";

/**
 * Curated hues for well-known instances so the common raids read at a
 * glance (Molten Core orange, Onyxia green, ...). Anything unlisted gets a
 * stable hue derived from its name.
 */
const INSTANCE_HUES: Record<string, number> = {
  "Molten Core": 20,
  "Onyxia's Lair": 130,
  "Blackwing Lair": 0,
  "Temple of Ahn'Qiraj": 45,
  "Ruins of Ahn'Qiraj": 40,
  Naxxramas: 195,
  "Zul'Gurub": 160,
  "Emerald Sanctum": 145,
  "Tower of Karazhan": 255,
  "Lower Tower of Karazhan": 255,
  "Upper Tower of Karazhan": 265,
  "Karazhan Crypts": 245,
};

export function instanceHue(name: string): number {
  const known = INSTANCE_HUES[name];
  if (known !== undefined) return known;
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

/** Vertical gradient for accent bars (Recent panel list rows). */
export function instanceAccentGradient(name: string): string {
  const hue = instanceHue(name);
  return `linear-gradient(180deg, hsl(${hue} 70% 55%), hsl(${hue} 75% 28%))`;
}

/** Flat tinted-chip style for calendar event pills. */
export function instancePillStyle(name: string): CSSProperties {
  const hue = instanceHue(name);
  return {
    background: `hsl(${hue} 55% 20% / 0.9)`,
    color: `hsl(${hue} 70% 66%)`,
  };
}
