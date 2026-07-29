export type GridResizeEdge = "top" | "right" | "bottom" | "left";
export type GridResizeDelta = -1 | 1;

export interface GridResizableItem {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function resizeGridItemFromEdge<T extends GridResizableItem>(
  item: T,
  edge: GridResizeEdge,
  delta: GridResizeDelta,
  cols: number,
): T {
  const minW = item.minW ?? 1;
  const minH = item.minH ?? 1;
  const maxW = Math.min(item.maxW ?? cols, cols);
  const maxH = item.maxH ?? Number.POSITIVE_INFINITY;
  const next = { ...item };

  if (edge === "right") {
    next.w = clamp(item.w + delta, minW, Math.min(maxW, cols - item.x));
  } else if (edge === "bottom") {
    next.h = clamp(item.h + delta, minH, maxH);
  } else if (edge === "left") {
    if (delta > 0) {
      const growth = Math.max(0, Math.min(1, item.x, maxW - item.w));
      next.x = item.x - growth;
      next.w = item.w + growth;
    } else if (item.w > minW) {
      next.x = item.x + 1;
      next.w = item.w - 1;
    }
  } else if (edge === "top") {
    if (delta > 0) {
      const growth = Math.max(0, Math.min(1, item.y, maxH - item.h));
      next.y = item.y - growth;
      next.h = item.h + growth;
    } else if (item.h > minH) {
      next.y = item.y + 1;
      next.h = item.h - 1;
    }
  }

  return next;
}

export function gridItemChanged(
  before: GridResizableItem,
  after: GridResizableItem,
): boolean {
  return before.x !== after.x || before.y !== after.y || before.w !== after.w || before.h !== after.h;
}
