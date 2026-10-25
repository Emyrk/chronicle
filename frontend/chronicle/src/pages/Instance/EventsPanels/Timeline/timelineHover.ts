export interface TimelineHoverSeries {
  id: string | number;
  color?: string;
  data: readonly {
    x: unknown;
    y: unknown;
  }[];
}

export interface TimelineHoverMeta {
  name: string;
  aggregation: string;
}

export interface TimelineHoverRow {
  seriesId: string;
  name: string;
  color: string;
  value: number;
  perSecond: boolean;
}

export interface TimelineHoverSnapshot {
  sec: number;
  rows: TimelineHoverRow[];
}

/**
 * Resolve the nearest regular timeline bin without creating an SVG hit target
 * for every rendered point. The chart always emits one point at t=0 followed
 * by one point per bin, so the nearest point is derived directly from binMs.
 */
export function getTimelineHoverSnapshot(
  series: readonly TimelineHoverSeries[],
  rawSec: number,
  binMs: number,
  seriesMeta: ReadonlyMap<string, TimelineHoverMeta>,
): TimelineHoverSnapshot | null {
  if (series.length === 0 || binMs <= 0 || !Number.isFinite(rawSec)) return null;

  const pointCount = series.reduce((max, item) => Math.max(max, item.data.length), 0);
  if (pointCount === 0) return null;

  const binSec = binMs / 1000;
  const index = Math.max(0, Math.min(pointCount - 1, Math.round(rawSec / binSec)));
  const firstPoint = series.find((item) => item.data[index] != null)?.data[index];
  const pointSec = Number(firstPoint?.x);

  const rows = series.flatMap((item): TimelineHoverRow[] => {
    const point = item.data[index];
    if (!point) return [];

    const value = Number(point.y);
    if (!Number.isFinite(value)) return [];

    const seriesId = String(item.id);
    const meta = seriesMeta.get(seriesId);
    return [{
      seriesId,
      name: meta?.name ?? seriesId,
      color: item.color ?? "#888",
      value,
      perSecond: meta?.aggregation === "per_second",
    }];
  });

  rows.sort((a, b) => b.value - a.value);

  return {
    sec: Number.isFinite(pointSec) ? pointSec : index * binSec,
    rows,
  };
}
