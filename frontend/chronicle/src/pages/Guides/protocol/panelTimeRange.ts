import { createContext, useContext } from "react";
import type { PanelTimeRange } from "../runtime/runtime";

export interface PanelTimeRangeValue {
  /** The page's time range in ms from encounter start; null when none is set. */
  range: PanelTimeRange | null;
  /** Sets (or with null, clears) the page's time range. Absent where there is no page range. */
  select?: (range: PanelTimeRange | null) => void;
}

/** Provided by LuaPanelHost so widget renderers (e.g. a selectable LineChart) can read and set the page range. */
export const PanelTimeRangeContext = createContext<PanelTimeRangeValue | null>(null);

export function usePanelTimeRange(): PanelTimeRangeValue | null {
  return useContext(PanelTimeRangeContext);
}

/**
 * Converts a dragged x span on a chart whose x axis is fight time in `msPerUnit` ms into a page
 * time range. Returns undefined for a click without a span.
 */
export function dragToTimeRange(startX: number, endX: number, msPerUnit: number): PanelTimeRange | undefined {
  const lo = Math.max(0, Math.round(Math.min(startX, endX) * msPerUnit));
  const hi = Math.max(0, Math.round(Math.max(startX, endX) * msPerUnit));
  return hi > lo ? { startMs: lo, endMs: hi } : undefined;
}
