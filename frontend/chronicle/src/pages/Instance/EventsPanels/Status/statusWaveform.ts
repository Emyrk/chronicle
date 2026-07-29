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
  if (events.length === 0) return { rowMax: 1, highMagnitudeThreshold: Infinity };
  const amounts = events.map((event) => event.amount).sort((a, b) => a - b);
  const thresholdIndex = Math.ceil(amounts.length * 0.85) - 1;
  return {
    rowMax: amounts[amounts.length - 1],
    highMagnitudeThreshold: amounts[Math.max(0, thresholdIndex)],
  };
}

export function statusWaveformBarHeight(amount: number, rowMax: number): number {
  if (amount <= 0 || rowMax <= 0) return 3;
  return Math.max(3, Math.round(10 * Math.pow(Math.min(1, amount / rowMax), 0.45)));
}

export function statusWaveformBarOpacity(amount: number, highMagnitudeThreshold: number): number {
  return amount >= highMagnitudeThreshold ? 0.95 : 0.72;
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
