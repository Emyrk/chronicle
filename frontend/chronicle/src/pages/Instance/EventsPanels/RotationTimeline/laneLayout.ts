/**
 * Cast lane geometry for a zoom level (design: Rotations "Zoom that enlarges
 * icons", 8a). Pure so the lane, label column and tooltips agree on it.
 */

export type IconSizeMode = "auto" | "s" | "m" | "l";

export const FIXED_ICON_SIZES: Record<Exclude<IconSizeMode, "auto">, number> = { s: 22, m: 34, l: 48 };

/** Spacing auto sizing aims to fill: roughly one global cooldown. */
export const GCD_SPACING_MS = 1600;
export const AUTO_FILL = 0.5;
export const MIN_ICON = 22;
export const MAX_ICON = 40;
/** Below this many px per GCD, icons cannot fit and casts draw as ticks. */
export const COMPACT_GAP_PX = 14;
const ICON_TOP = 8;

export interface LaneLayout {
  /** Casts draw as thin ticks instead of icons. */
  compact: boolean;
  /** Cast icon size. */
  icon: number;
  /** Proc (off-GCD) circle size. */
  proc: number;
  /** Cooldown square size. */
  cooldown: number;
  /** Damage label font size. */
  labelFont: number;
  iconTop: number;
  labelTop: number;
  /** y of the busy/idle rail; procs and cooldowns sit centered on it. */
  railTop: number;
  height: number;
}

export function laneLayout(pxPerMs: number, mode: IconSizeMode): LaneLayout {
  const gap = GCD_SPACING_MS * pxPerMs;
  const icon =
    mode === "auto" ? Math.round(Math.max(MIN_ICON, Math.min(MAX_ICON, gap * AUTO_FILL))) : FIXED_ICON_SIZES[mode];
  const compact = mode === "auto" && gap < COMPACT_GAP_PX;
  // Procs and cooldowns keep their proportion to the cast icons at every size.
  const proc = Math.round(icon * 0.5);
  const cooldown = Math.round(icon * 0.7);
  const labelFont = icon >= 40 ? 11 : icon >= 32 ? 10 : 9;
  // No spell names: icons and tooltips identify spells.
  const labelTop = ICON_TOP + icon + 3;
  const labelsBottom = labelTop + labelFont + 2;
  const railTop = labelsBottom + cooldown / 2 + 2;
  return {
    compact,
    icon,
    proc,
    cooldown,
    labelFont,
    iconTop: ICON_TOP,
    labelTop,
    railTop,
    height: Math.round(railTop + cooldown / 2 + 5),
  };
}

/** Distinct colors for cooldown strips and rings, assigned in order. */
export const COOLDOWN_COLORS = ["#f59e0b", "#ef4444", "#a855f7", "#22c55e", "#06b6d4", "#ec4899", "#eab308", "#3b82f6"];

/** Width of the label column shared by the overview, lanes and aura rows. */
export const LABEL_WIDTH = 220;
