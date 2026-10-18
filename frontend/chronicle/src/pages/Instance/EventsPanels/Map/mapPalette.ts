/**
 * Colours the 3D map draws with outside the unit tokens (see unitTokenArt),
 * kept free of three.js so the map legend page (/map-legend) shows the same.
 */

// Health bars: their backing, a dead unit's bar, absorbs, and recent healing
// at the end of the fill (tailwind green-200). The fill itself is healthBarColor.
export const BAR_BACKGROUND = 0x0c0a09;
export const BAR_DEAD = 0x57534e;
export const BAR_ABSORB = 0xe7e5e4;
export const BAR_HEAL = 0xbbf7d0;
/** A dead model's grey. */
export const DEAD_COLOR = 0x57534e;
/** A cast icon's outline sweeps round it in white at this opacity; an interrupted cast's cut-off part in CUT_ARC_COLOR. */
export const CAST_ARC_OPACITY = 0.7;
/** A major cooldown's cast icon: framed (and its cast sweep drawn) in this gold, this many times the size. */
export const COOLDOWN_ICON_COLOR = "#fbbf24";
export const COOLDOWN_ICON_SCALE = 1.3;
export const CUT_ARC_COLOR = "#78716c";
/** The red tick where an interrupted cast was cut. */
export const CUT_TICK_COLOR = "#ef4444";
/** The label under an interrupted cast's icon. */
export const INTERRUPT_LABEL_COLOR = "#c2847e";
/** Your character in walk mode. */
export const WALK_AVATAR_COLOR = 0xffd100;
export const WALK_AVATAR_EMISSIVE = 0x3a2a00;

/** "#rrggbb" for a 0xrrggbb colour. */
export function hexCss(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}
