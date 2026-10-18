import type { ReplayControllerResult } from "./replayController.processor";

export interface ReplayBounds {
  startMs: number;
  endMs: number;
}

export type ReplayBarState = "past" | "current" | "future";

export interface ReplayBar {
  /** Full bar height: the bar's raid durability, 0–100. */
  height: number;
  /** Played part: all of a played or current bar, none of a future one. */
  fill: number;
  state: ReplayBarState;
  startMs: number;
  /** Raid durability %, the lowest in the bar. */
  value: number;
}

export interface ReplayMarker {
  kind: "death";
  /** Position along the track, 0–100. */
  left: number;
  title: string;
  /** At or before the cursor; later markers are dimmed. */
  past: boolean;
}

export interface ReplayTick {
  left: number;
  label: string;
  align: "start" | "center" | "end";
}

export function formatReplayClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function trackPercent(timestampMs: number, bounds: ReplayBounds): number {
  return ((timestampMs - bounds.startMs) / Math.max(1, bounds.endMs - bounds.startMs)) * 100;
}

/** Aim for about this many bars whatever the fight length. */
const TARGET_BAR_COUNT = 90;
const BUCKET_STEPS_MS = [500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000];

/** The bar width for a fight: the smallest step that keeps it to about TARGET_BAR_COUNT bars. */
export function replayBucketMs(durationMs: number): number {
  const wanted = durationMs / TARGET_BAR_COUNT;
  return BUCKET_STEPS_MS.find((step) => step >= wanted) ?? BUCKET_STEPS_MS[BUCKET_STEPS_MS.length - 1];
}

/** "500ms", "2s", "1m". */
export function formatBucket(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${ms / 1000}s`;
  return `${ms / 60_000}m`;
}

/** Points sampled per bar when looking for its lowest durability. */
const DURABILITY_SAMPLES = 4;

/**
 * One bar per `bucketMs` of the replay bounds: the raid's lowest durability
 * (0–100%) in it, from `durabilityAt` (null where no encounter covers the
 * time, which leaves the bar empty). Bars ahead of the cursor are unplayed;
 * with no cursor (replay off) every bar reads as played.
 */
export function replayDurabilityBars(
  durabilityAt: (timestampMs: number) => number | null,
  bounds: ReplayBounds,
  cursorMs: number | null,
  bucketMs = replayBucketMs(bounds.endMs - bounds.startMs),
): ReplayBar[] {
  const count = Math.max(0, Math.ceil((bounds.endMs - bounds.startMs) / bucketMs));
  return Array.from({ length: count }, (_, index): ReplayBar => {
    const startMs = bounds.startMs + index * bucketMs;
    const endMs = Math.min(bounds.endMs, startMs + bucketMs);
    let value: number | null = null;
    for (let sample = 0; sample <= DURABILITY_SAMPLES; sample++) {
      const percent = durabilityAt(startMs + ((endMs - startMs) * sample) / DURABILITY_SAMPLES);
      if (percent !== null) value = value === null ? percent : Math.min(value, percent);
    }
    const height = Math.max(0, Math.min(100, value ?? 0));
    if (cursorMs === null || cursorMs >= startMs + bucketMs) return { height, fill: height, state: "past", startMs, value: height };
    if (cursorMs < startMs) return { height, fill: 0, state: "future", startMs, value: height };
    return { height, fill: height, state: "current", startMs, value: height };
  });
}

/** Player deaths inside the bounds. */
export function replayControllerMarkers(
  result: ReplayControllerResult,
  bounds: ReplayBounds,
  cursorMs: number | null,
): ReplayMarker[] {
  const inBounds = (timestampMs: number) => timestampMs >= bounds.startMs && timestampMs <= bounds.endMs;
  const marker = (kind: ReplayMarker["kind"], timestampMs: number, label: string): ReplayMarker => ({
    kind,
    left: trackPercent(timestampMs, bounds),
    title: `${formatReplayClock(timestampMs - bounds.startMs)} ${label}`,
    past: cursorMs === null || timestampMs <= cursorMs,
  });
  const markers: ReplayMarker[] = [];
  if (result.baseMs !== null) {
    for (const death of result.timeline.playerDeaths) {
      const timestampMs = result.baseMs + death.offsetMs;
      if (inBounds(timestampMs)) markers.push(marker("death", timestampMs, `${death.playerName} died`));
    }
  }
  return markers.sort((left, right) => left.left - right.left);
}

const TICK_STEPS_MS = [15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000];
const MAX_TICKS = 8;

/** Elapsed-time labels under the track, at a step that keeps at most MAX_TICKS. */
export function replayControllerTicks(bounds: ReplayBounds): ReplayTick[] {
  const duration = Math.max(0, bounds.endMs - bounds.startMs);
  const step = TICK_STEPS_MS.find((candidate) => duration / candidate <= MAX_TICKS - 1) ?? TICK_STEPS_MS[TICK_STEPS_MS.length - 1];
  const ticks: ReplayTick[] = [];
  for (let elapsed = 0; elapsed <= duration; elapsed += step) {
    ticks.push({ left: (elapsed / Math.max(1, duration)) * 100, label: formatReplayClock(elapsed), align: elapsed === 0 ? "start" : "center" });
  }
  const last = ticks[ticks.length - 1];
  if (last && last.left > 92 && ticks.length > 1) last.align = "end";
  return ticks;
}
