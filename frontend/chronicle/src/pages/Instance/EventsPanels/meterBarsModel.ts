import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";

/** Rows shown before the "+N more" affordance in values mode. */
export const METER_VALUES_DEFAULT_LIMIT = 5;

/** A small label beside a row's values, e.g. `TANK` or `PULLS`. */
export interface MeterBarTag {
  label: string;
  color?: string;
}

/** A vertical line across the rows at `value` on the bar scale (e.g. 110% of the tank's threat). */
export interface MeterBarMarker {
  value: number;
  color: string;
  label?: string;
}

/**
 * The compact "values" look (landing column, hero glass meter): 22 px rows with
 * a value and a share column, the top `limit` rows and "+N more".
 */
export interface MeterValuesOptions {
  formatValue?: (value: number) => string;
  /** Share column denominator (threat: the tank's threat). Defaults to the sum of all rows. */
  shareBase?: number;
  formatShare?: (share: number) => string;
  /** Value at full bar width. Defaults to the top row; raise it to make room for markers. */
  scaleMax?: number;
  limit?: number;
  tagFor?: (row: PlayerMetricChartData) => MeterBarTag | undefined;
  markers?: MeterBarMarker[];
  /** Keeps this row first whatever its value (threat: the tank). */
  pinFirst?: (row: PlayerMetricChartData) => boolean;
}

export interface MeterValuesRow {
  row: PlayerMetricChartData;
  widthPct: number;
  value: string;
  share: string;
  tag?: MeterBarTag;
}

export interface MeterValuesModel {
  rows: MeterValuesRow[];
  more: number;
  markers: (MeterBarMarker & { leftPct: number })[];
}

const defaultFormatShare = (share: number) => `${(share * 100).toFixed(1)}%`;

export function buildMeterValuesModel(data: PlayerMetricChartData[], options: MeterValuesOptions): MeterValuesModel {
  const sorted = [...data].sort((left, right) => right.value - left.value);
  const pinned = options.pinFirst ? sorted.findIndex(options.pinFirst) : -1;
  if (pinned > 0) sorted.unshift(...sorted.splice(pinned, 1));
  const sum = sorted.reduce((total, row) => total + row.value, 0);
  const scale = options.scaleMax ?? Math.max(0, ...sorted.map((row) => row.value));
  const shareBase = options.shareBase ?? sum;
  const formatValue = options.formatValue ?? ((value: number) => String(Math.round(value)));
  const formatShare = options.formatShare ?? defaultFormatShare;
  const shown = sorted.slice(0, Math.max(0, options.limit ?? METER_VALUES_DEFAULT_LIMIT));
  return {
    rows: shown.map((row) => ({
      row,
      widthPct: scale > 0 ? Math.min(100, (row.value / scale) * 100) : 0,
      value: formatValue(row.value),
      share: formatShare(shareBase > 0 ? row.value / shareBase : 0),
      tag: options.tagFor?.(row),
    })),
    more: sorted.length - shown.length,
    // Off-scale markers would sit outside the rows; drop them.
    markers: scale > 0
      ? (options.markers ?? [])
          .map((marker) => ({ ...marker, leftPct: (marker.value / scale) * 100 }))
          .filter((marker) => marker.leftPct > 0 && marker.leftPct <= 100)
      : [],
  };
}
