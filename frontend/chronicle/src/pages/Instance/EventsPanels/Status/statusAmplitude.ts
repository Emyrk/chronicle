import type { StatusEventKind, StatusTimelineEvent } from "./status.processor";

export interface StatusMarkerAmplitude {
  intensity: number;
  width: number;
  heightScale: number;
  color: string | null;
}

/**
 * Uses the median visible damage/healing event as a version-independent baseline.
 * A median hit or heal lands in the middle of the visual range, while the
 * logarithmic scale keeps unusually large events distinct without letting one
 * outlier flatten every other marker.
 */
export function statusAmplitudeBaseline(events: StatusTimelineEvent[]): number {
  const amounts = events
    .filter((event) => (event.kind === "damage" || event.kind === "heal") && event.amount > 0)
    .map((event) => event.amount)
    .sort((a, b) => a - b);
  if (amounts.length === 0) return 1;
  const middle = Math.floor(amounts.length / 2);
  return amounts.length % 2 === 0
    ? (amounts[middle - 1] + amounts[middle]) / 2
    : amounts[middle];
}

export function statusEventOpacity(
  timestampMilli: number,
  cursorMilli: number,
  historyMilli: number,
): number {
  if (timestampMilli >= cursorMilli) return 0.9;
  if (historyMilli <= 0) return 0;
  const recency = Math.max(0, Math.min(1, 1 - (cursorMilli - timestampMilli) / historyMilli));
  return 0.9 * recency ** 1.6;
}

export function statusMarkerAmplitude(
  kind: StatusEventKind,
  amount: number,
  baseline: number,
): StatusMarkerAmplitude {
  if (kind !== "damage" && kind !== "heal") {
    return { intensity: 0.5, width: 4, heightScale: 0.7, color: null };
  }

  const safeBaseline = Math.max(1, baseline);
  const ratio = Math.max(0.01, amount / safeBaseline);
  const intensity = Math.max(0, Math.min(1, (Math.log2(ratio) + 2) / 4));
  const hue = kind === "damage" ? 0 : 151;
  const saturation = 66 + intensity * 14;
  const lightness = 38 + intensity * 14;

  return {
    intensity,
    width: 2 + intensity * 4,
    heightScale: 0.55 + intensity * 0.4,
    color: `hsl(${hue} ${saturation}% ${lightness}%)`,
  };
}
