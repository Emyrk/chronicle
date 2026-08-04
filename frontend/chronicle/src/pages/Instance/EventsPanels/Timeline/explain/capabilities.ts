/**
 * Capability derivation for Line Chart (Timeline) lessons.
 * Pure function — no DOM inference, no React.
 */

import type { TimelineResult } from "../timeline.processor";

export interface TimelineCapabilities {
  /** Any series produced at least one non-zero bin. */
  hasData: boolean;
  /** Per-second values are derivable (non-zero duration). */
  hasDuration: boolean;
}

export function deriveCapabilities(
  result: TimelineResult | null | undefined,
  durationMs: number,
): TimelineCapabilities {
  let hasData = false;
  if (result) {
    outer: for (const bins of result.series.values()) {
      for (const v of bins) {
        if (v > 0) {
          hasData = true;
          break outer;
        }
      }
    }
  }
  return { hasData, hasDuration: durationMs > 0 };
}
