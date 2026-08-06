// Shared per-instance accent colors for guild page panels, sourced from the
// instance config's accentColor. Instances without a config entry get a
// stable hue derived from their name.

import type { CSSProperties } from "react";
import { getInstanceConfig } from "@/pages/Logs/utils/instanceImages";

function hashHue(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Vertical gradient for accent bars (Recent panel list rows). */
export function instanceAccentGradient(name: string): string {
  const accent = getInstanceConfig(name)?.accentColor;
  const rgb = accent ? hexToRgb(accent) : null;
  if (rgb) {
    const [r, g, b] = rgb;
    const dark = `rgb(${Math.round(r * 0.45)} ${Math.round(g * 0.45)} ${Math.round(b * 0.45)})`;
    return `linear-gradient(180deg, ${accent}, ${dark})`;
  }
  const hue = hashHue(name);
  return `linear-gradient(180deg, hsl(${hue} 70% 55%), hsl(${hue} 75% 28%))`;
}

/** Flat tinted-chip style for calendar event pills. */
export function instancePillStyle(name: string): CSSProperties {
  const accent = getInstanceConfig(name)?.accentColor;
  const rgb = accent ? hexToRgb(accent) : null;
  if (rgb) {
    const [r, g, b] = rgb;
    // Lighten the accent slightly for text so darker accents stay readable.
    const text = `rgb(${Math.round(r + (255 - r) * 0.25)} ${Math.round(g + (255 - g) * 0.25)} ${Math.round(b + (255 - b) * 0.25)})`;
    return {
      background: `rgb(${r} ${g} ${b} / 0.18)`,
      color: text,
    };
  }
  const hue = hashHue(name);
  return {
    background: `hsl(${hue} 55% 20% / 0.9)`,
    color: `hsl(${hue} 70% 66%)`,
  };
}
