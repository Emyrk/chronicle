import type { VehicleControlInterval } from "@/api/typesGenerated";
import type { Encounter } from "../../InstancePage";

export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface TimelineTick {
  elapsedMs: number;
  positionPercent: number;
  label: string;
}

const TIMELINE_STEPS_MS = [
  100,
  250,
  500,
  1_000,
  2_000,
  5_000,
  10_000,
  15_000,
  30_000,
  60_000,
  120_000,
  300_000,
  600_000,
  900_000,
  1_800_000,
  3_600_000,
];

export function selectedEncounterRange(
  encounters: Encounter[],
  selectedEncounterIds: string[],
): TimeRange | null {
  const selected = new Set(selectedEncounterIds);
  let startMs = Number.POSITIVE_INFINITY;
  let endMs = Number.NEGATIVE_INFINITY;

  for (const encounter of encounters) {
    if (!selected.has(encounter.id)) continue;
    startMs = Math.min(startMs, new Date(encounter.start_time).getTime());
    endMs = Math.max(endMs, new Date(encounter.end_time).getTime());
  }

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }
  return { startMs, endMs };
}

export function intervalOverlapsRange(
  interval: VehicleControlInterval,
  range: TimeRange,
): boolean {
  const releasedAtMs = interval.released_at_ms ?? Number.POSITIVE_INFINITY;
  return interval.assigned_at_ms <= range.endMs && releasedAtMs > range.startMs;
}

export function clipIntervalToRange(
  interval: VehicleControlInterval,
  range: TimeRange,
): TimeRange {
  return {
    startMs: Math.max(interval.assigned_at_ms, range.startMs),
    endMs: Math.min(interval.released_at_ms ?? range.endMs, range.endMs),
  };
}

export function formatVehicleDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatTimelineElapsed(elapsedMs: number): string {
  if (elapsedMs === 0) return "0s";
  if (elapsedMs < 1_000) return `${Math.round(elapsedMs)}ms`;

  const totalSeconds = elapsedMs / 1_000;
  if (totalSeconds < 60) {
    return Number.isInteger(totalSeconds) ? `${totalSeconds}s` : `${totalSeconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

export function buildTimelineTicks(durationMs: number, targetIntervals = 6): TimelineTick[] {
  const safeDurationMs = Math.max(durationMs, 1);
  const stepMs =
    TIMELINE_STEPS_MS.find((candidate) => safeDurationMs / candidate <= targetIntervals) ??
    TIMELINE_STEPS_MS[TIMELINE_STEPS_MS.length - 1];

  const elapsedValues = [0];
  for (let elapsedMs = stepMs; elapsedMs < safeDurationMs; elapsedMs += stepMs) {
    elapsedValues.push(elapsedMs);
  }
  elapsedValues.push(safeDurationMs);

  return elapsedValues.map((elapsedMs) => ({
    elapsedMs,
    positionPercent: (elapsedMs / safeDurationMs) * 100,
    label: formatTimelineElapsed(elapsedMs),
  }));
}
