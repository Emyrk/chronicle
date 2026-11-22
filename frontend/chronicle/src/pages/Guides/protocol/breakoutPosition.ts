const GAP = 8;
/** Height of a breakout's title bar, in pixels. */
export const BREAKOUT_HEADER = 30;

export interface BreakoutPosition { x: number; y: number }

/**
 * Where a breakout opens: beside its anchor frame (right, then left, then below), or beside the
 * panel when it has none, kept inside the viewport. Viewport coordinates, for position: fixed.
 */
export function breakoutPosition(anchor: Pick<DOMRect, "top" | "left" | "right" | "bottom">, size: { width: number; height: number }, viewport: { width: number; height: number }): BreakoutPosition {
  const clamp = (value: number, max: number) => Math.max(GAP, Math.min(value, max - GAP));
  const y = clamp(anchor.top, viewport.height - size.height);
  if (anchor.right + GAP + size.width <= viewport.width - GAP) return { x: anchor.right + GAP, y };
  if (anchor.left - GAP - size.width >= GAP) return { x: anchor.left - GAP - size.width, y };
  return { x: clamp(anchor.left, viewport.width - size.width), y: clamp(anchor.bottom + GAP, viewport.height - size.height) };
}
