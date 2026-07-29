export const DEFAULT_BREAKOUT_BODY_HEIGHT = 208;
export const MIN_BREAKOUT_BODY_HEIGHT = 120;

export function clampBreakoutBodyHeight(height: number, viewportHeight: number): number {
  const maximum = Math.max(MIN_BREAKOUT_BODY_HEIGHT, viewportHeight - 220);
  return Math.max(MIN_BREAKOUT_BODY_HEIGHT, Math.min(maximum, Math.round(height)));
}
