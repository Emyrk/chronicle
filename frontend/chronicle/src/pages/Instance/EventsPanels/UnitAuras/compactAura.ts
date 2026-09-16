export interface CompactAuraColors {
  ring: string;
  surface: string;
  badge: string;
}

export function compactAuraPercent(uptimeMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.max(0, Math.min(100, (uptimeMs / durationMs) * 100));
}

export function compactAuraColors(percent: number): CompactAuraColors {
  const clamped = Math.max(0, Math.min(100, percent));
  const hue = 210 - (clamped / 100) * 65;
  return {
    ring: `hsl(${hue} 72% 50%)`,
    surface: `hsl(${hue} 55% 18% / 0.72)`,
    badge: `hsl(${hue} 78% 55%)`,
  };
}

export function compactAuraKind(isBuff: boolean): "Buff" | "Debuff" {
  return isBuff ? "Buff" : "Debuff";
}

export function formatCompactAuraPercent(percent: number): string {
  if (percent >= 10) return Math.round(percent).toString();
  return percent.toFixed(1);
}
