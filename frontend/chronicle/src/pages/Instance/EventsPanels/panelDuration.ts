import type { PanelFilter } from "./processors/filters";

export interface PanelTimeRange {
  enabled: boolean;
  startOffsetMs: number | null;
  endOffsetMs: number | null;
  totalDurationMs: number;
}

function parseTimeRange(
  filter: PanelFilter,
  controller: PanelTimeRange | null,
): { startMs: number | null; endMs: number | null; totalDurationMs: number } | null {
  if (filter.type !== "time_range" || filter.negate) return null;

  const value = Array.isArray(filter.value) ? (filter.value[0] ?? "") : filter.value;
  if (value === "controller") {
    if (
      !controller?.enabled ||
      (controller.startOffsetMs == null && controller.endOffsetMs == null)
    ) {
      return null;
    }
    return {
      startMs: controller.startOffsetMs,
      endMs: controller.endOffsetMs,
      totalDurationMs: controller.totalDurationMs,
    };
  }

  const [startValue, endValue] = value.split(",");
  const startMs = startValue === "" ? null : Number(startValue);
  const endMs = endValue === "" ? null : Number(endValue);
  if (
    (startMs == null || !Number.isFinite(startMs)) &&
    (endMs == null || !Number.isFinite(endMs))
  ) {
    return null;
  }

  return {
    startMs: startMs != null && Number.isFinite(startMs) ? startMs : null,
    endMs: endMs != null && Number.isFinite(endMs) ? endMs : null,
    totalDurationMs: controller?.totalDurationMs ?? 0,
  };
}

/**
 * Return the duration selected by an active Time Range filter.
 *
 * Controller-backed filters use the shared Time Range selection. Direct filters
 * use their own bounds. A minimum of 1 ms keeps per-second calculations finite
 * for a zero-width selection.
 */
export function getTimeRangeDurationMs(
  filters: PanelFilter[],
  controller: PanelTimeRange | null,
  fullDurationMs: number,
): number | null {
  for (const filter of filters) {
    const range = parseTimeRange(filter, controller);
    if (!range) continue;

    const totalDurationMs = range.totalDurationMs > 0
      ? Math.min(range.totalDurationMs, fullDurationMs)
      : fullDurationMs;
    const startMs = Math.max(0, Math.min(range.startMs ?? 0, totalDurationMs));
    const endMs = Math.max(startMs, Math.min(range.endMs ?? totalDurationMs, totalDurationMs));
    return Math.max(endMs - startMs, 1);
  }

  return null;
}
