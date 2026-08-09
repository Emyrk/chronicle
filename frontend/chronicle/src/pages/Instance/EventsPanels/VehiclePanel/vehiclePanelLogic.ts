import type { VehicleControlInterval } from "@/api/typesGenerated";
import type { Encounter } from "../../InstancePage";

export interface TimeRange {
  startMs: number;
  endMs: number;
}

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
