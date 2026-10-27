export const MIN_SIDE_WIDTH = 320
export const MIN_MAIN_WIDTH = 360

/** Clamps a side-column width so both workshop columns keep a usable minimum. */
export function clampSideWidth(width: number, containerWidth: number): number {
  return Math.round(Math.max(MIN_SIDE_WIDTH, Math.min(width, containerWidth - MIN_MAIN_WIDTH)))
}
