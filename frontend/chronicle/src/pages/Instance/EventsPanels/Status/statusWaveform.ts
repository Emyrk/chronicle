import type { StatusTimelineEvent } from "./status.processor";

export const STATUS_WAVEFORM_COLORS = {
  damage: "#d4423f",
  heal: "#5fae74",
  absorbed: "#7aa7d9",
} as const;

export type StatusWaveformEvent = StatusTimelineEvent & {
  kind: "damage" | "heal" | "absorbed";
};

export interface StatusWaveformScale {
  rowMedian: number;
  rowMax: number;
  highMagnitudeThreshold: number;
}

export function statusWaveformEvents(events: StatusTimelineEvent[]): StatusWaveformEvent[] {
  return events.filter((event): event is StatusWaveformEvent =>
    (event.kind === "damage" || event.kind === "heal" || event.kind === "absorbed")
    && event.amount > 0,
  );
}

export function statusWaveformScale(events: StatusWaveformEvent[]): StatusWaveformScale {
  if (events.length === 0) {
    return { rowMedian: 0, rowMax: 0, highMagnitudeThreshold: Infinity };
  }
  const amounts = events.map((event) => event.amount).sort((a, b) => a - b);
  const middle = Math.floor(amounts.length / 2);
  const rowMedian = amounts.length % 2 === 0
    ? (amounts[middle - 1] + amounts[middle]) / 2
    : amounts[middle];
  const thresholdIndex = Math.ceil(amounts.length * 0.85) - 1;
  return {
    rowMedian,
    rowMax: amounts[amounts.length - 1],
    highMagnitudeThreshold: amounts[Math.max(0, thresholdIndex)],
  };
}

export interface StatusWaveformScaleSummary {
  min: number;
  median: number;
  max: number;
}

export function statusWaveformScaleSummary(rowMaxes: number[]): StatusWaveformScaleSummary | null {
  const values = rowMaxes.filter((value) => value > 0).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const median = values.length % 2 === 0
    ? (values[middle - 1] + values[middle]) / 2
    : values[middle];
  return {
    min: values[0],
    median,
    max: values[values.length - 1],
  };
}

export function statusWaveformBarHeight(
  amount: number,
  rowMedian: number,
  rowMax: number,
): number {
  if (amount <= 0 || rowMax <= 0) return 3;
  if (rowMedian <= 0 || rowMedian >= rowMax) {
    return amount >= rowMax ? 10 : 3;
  }
  if (amount <= rowMedian) {
    const belowMedian = Math.max(0, Math.min(1, amount / rowMedian));
    return 3 + Math.round(belowMedian ** 2);
  }
  const aboveMedian = Math.max(0, Math.min(1, (amount - rowMedian) / (rowMax - rowMedian)));
  return 4 + Math.round(6 * aboveMedian ** 1.7);
}

export function statusWaveformBarOpacity(
  amount: number,
  highMagnitudeThreshold: number,
  timestampMilli: number,
  cursorMilli: number,
  historyMilli: number,
): number {
  const magnitudeOpacity = amount >= highMagnitudeThreshold ? 0.95 : 0.72;
  if (timestampMilli >= cursorMilli) return magnitudeOpacity;
  if (historyMilli <= 0) return 0;
  const recency = Math.max(0, Math.min(1, 1 - (cursorMilli - timestampMilli) / historyMilli));
  return magnitudeOpacity * recency ** 1.35;
}

export function statusWaveformBarWidth(historyMilli: number, futureMilli: number): number {
  return historyMilli + futureMilli <= 10_000 ? 3 : 2;
}

export function statusWaveformPosition(
  timestampMilli: number,
  windowStartMilli: number,
  windowMilli: number,
): number {
  if (windowMilli <= 0) return 0;
  const percent = ((timestampMilli - windowStartMilli) / windowMilli) * 100;
  return Math.max(0, Math.min(99.7, percent));
}
