/**
 * Pure helpers for the cohort viewer: parse tiers, tier cutoffs, histogram
 * binning, and summary stats. Shared by the player and time cohort views.
 */

/** Parse tiers, best first. Floors match parseColor in parseColors.ts. */
export const PARSE_TIERS = [
  { floor: 100, label: "100" },
  { floor: 99, label: "99" },
  { floor: 95, label: "95–98" },
  { floor: 75, label: "75–94" },
  { floor: 50, label: "50–74" },
  { floor: 25, label: "25–49" },
  { floor: 0, label: "0–24" },
] as const;

/** Index into PARSE_TIERS for a display score. */
export function parseTierIndex(score: number): number {
  const index = PARSE_TIERS.findIndex((tier) => score >= tier.floor);
  return index === -1 ? PARSE_TIERS.length - 1 : index;
}

/** A cohort value with its server-computed display score. */
export interface ScoredValue {
  value: number;
  score: number;
}

/** "Lower is better" for times, "higher is better" for DPS/HPS. */
export type CohortDirection = "lower" | "higher";

export interface TierCutoff {
  floor: number;
  /** The weakest value that still reaches this tier, or null if none does. */
  value: number | null;
}

/**
 * For each tier floor, finds the weakest value that still scores at or above
 * it. For times that is the slowest qualifying time; for DPS the lowest.
 */
export function tierCutoffs(
  values: readonly ScoredValue[],
  direction: CohortDirection,
  floors: readonly number[] = [99, 95, 75, 50, 25],
): TierCutoff[] {
  return floors.map((floor) => {
    let cutoff: number | null = null;
    for (const { value, score } of values) {
      if (score < floor) continue;
      if (cutoff === null || (direction === "lower" ? value > cutoff : value < cutoff)) {
        cutoff = value;
      }
    }
    return { floor, value: cutoff };
  });
}

export interface CohortSummary {
  count: number;
  best: number;
  median: number;
  worst: number;
}

export function summarizeCohort(
  values: readonly number[],
  direction: CohortDirection,
): CohortSummary | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  return {
    count: sorted.length,
    best: direction === "lower" ? min : max,
    median,
    worst: direction === "lower" ? max : min,
  };
}

export interface HistogramBin {
  start: number;
  end: number;
  /** Count per PARSE_TIERS index. */
  tierCounts: number[];
  total: number;
}

/** Second-based steps that read well on a time axis, in ms. */
const TIME_STEPS_MS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600, 900, 1800, 3600].map((s) => s * 1000);

/** Picks a 1/2/5×10^k step, or a clock-friendly step for durations. */
export function niceStep(rawStep: number, time: boolean): number {
  if (rawStep <= 0) return 1;
  if (time) {
    return TIME_STEPS_MS.find((step) => step >= rawStep) ?? Math.ceil(rawStep / 3_600_000) * 3_600_000;
  }
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

/**
 * Bins scored values on nice boundaries, counting each bin by parse tier so
 * the chart can stack tiers within a bar.
 */
export function buildHistogram(
  values: readonly ScoredValue[],
  options: { targetBins?: number; time: boolean },
): HistogramBin[] {
  if (values.length === 0) return [];
  const targetBins = options.targetBins ?? 24;
  let min = Infinity;
  let max = -Infinity;
  for (const { value } of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const step = niceStep((max - min) / targetBins, options.time);
  const start = Math.floor(min / step) * step;
  const binCount = Math.max(1, Math.floor((max - start) / step) + 1);

  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    start: start + i * step,
    end: start + (i + 1) * step,
    tierCounts: PARSE_TIERS.map(() => 0),
    total: 0,
  }));
  for (const { value, score } of values) {
    const bin = bins[Math.min(binCount - 1, Math.floor((value - start) / step))];
    bin.tierCounts[parseTierIndex(score)]++;
    bin.total++;
  }
  return bins;
}

/** Formats a duration as m:ss, or h:mm:ss past an hour. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`;
  return `${minutes}:${seconds}`;
}

/** Formats DPS/HPS with one decimal under 1K and compact above. */
export function formatMetric(value: number): string {
  if (Math.abs(value) >= 1000) {
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return value.toFixed(1);
}
