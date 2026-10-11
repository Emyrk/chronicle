import {
  hasHitType,
  HitTypeCrit,
  HitTypeDodge,
  HitTypeGlancing,
  HitTypeMiss,
  HitTypeParry,
} from "@/lib/hittype/hittype";
import type { CastSource } from "./rotationTimeline.processor";

/** The log event behind a timeline cast, as shown in tooltips. */
export const CAST_SOURCE_LABELS: Record<CastSource, string> = {
  spell_go: "spell_go event",
  spell_fail: "spell_start → spell_fail",
  cast: "cast log line",
  aura: "aura event",
  consume: "consume event",
};

/**
 * Player A is steel blue, player B tan: the default theme's primary and
 * accent, fixed here because other deployments theme those two close together.
 */
const SLOT_A = "#5f8fa6";
const SLOT_B = "oklch(0.5692 0.0609 82.3871)";
export const SLOT_COLORS = [SLOT_A, SLOT_B] as const;
export const SLOT_LABELS = ["A", "B"] as const;
/** Slot colors for text; B is lightened so it reads on dark backgrounds. */
export const SLOT_TEXT_COLORS = [SLOT_A, `color-mix(in oklab, ${SLOT_B} 70%, white)`] as const;

/** 75_300 → "1:15.3"; negative values get a leading "-". */
export function formatClock(ms: number, decimals = 1): string {
  const neg = ms < 0;
  const totalSeconds = Math.abs(ms) / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const width = decimals > 0 ? 3 + decimals : 2;
  return `${neg ? "-" : ""}${minutes}:${seconds.toFixed(decimals).padStart(width, "0")}`;
}

/** Tick spacing that gives roughly 6–12 ticks across the span. */
export function tickStepMs(spanMs: number): number {
  const steps = [1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000];
  return steps.find((s) => spanMs / s <= 12) ?? 300_000;
}

/** Auto attack outcome colors: avoids are shades of red. */
export const SWING_COLORS = {
  miss: "#ef4444", // red-500
  dodge: "#fb7185", // rose-400
  parry: "#b91c1c", // red-700
  /** Other zero-damage outcomes: full block, absorb, immune, evade. */
  negated: "color-mix(in oklab, #ef4444 45%, transparent)",
  crit: "var(--color-school-holy)",
  glancing: "#9ca3af", // gray-400
  hit: "#ffffff",
} as const;

export function swingColor(hitType: number, amount: number): string {
  if (hasHitType(hitType, HitTypeMiss)) return SWING_COLORS.miss;
  if (hasHitType(hitType, HitTypeDodge)) return SWING_COLORS.dodge;
  if (hasHitType(hitType, HitTypeParry)) return SWING_COLORS.parry;
  if (amount === 0) return SWING_COLORS.negated;
  if (hasHitType(hitType, HitTypeCrit)) return SWING_COLORS.crit;
  if (hasHitType(hitType, HitTypeGlancing)) return SWING_COLORS.glancing;
  return SWING_COLORS.hit;
}
