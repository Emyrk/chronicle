import type { Encounter, EncounterPhase } from "./InstancePage";

/** Any encounter sub-range expressed as offsets from the encounter start. */
export type EncounterOffsetRange = Pick<EncounterPhase, "start_offset_ms" | "end_offset_ms">;

export interface PhaseTimeRangeSelection {
  encounterIds: [string];
  startOffsetMs: number;
  endOffsetMs: number;
}

/** Width percentage for a phase card relative to its encounter. */
export function phaseWidthPercent(
  phase: EncounterOffsetRange,
  encounter: Encounter,
): number {
  const encounterDuration = new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime();
  if (encounterDuration <= 0) return 0;
  return Math.max(0, Math.min(100,
    ((phase.end_offset_ms - phase.start_offset_ms) / encounterDuration) * 100,
  ));
}

/** Left offset percentage for a sub-range relative to its encounter. */
export function rangeStartPercent(
  range: EncounterOffsetRange,
  encounter: Encounter,
): number {
  const encounterDuration = new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime();
  if (encounterDuration <= 0) return 0;
  return Math.max(0, Math.min(100, (range.start_offset_ms / encounterDuration) * 100));
}

/** Convert a phase or ranked-window click into the existing single-encounter time-range state. */
export function phaseTimeRangeSelection(
  phase: EncounterOffsetRange,
  encounterId: string,
): PhaseTimeRangeSelection {
  return {
    encounterIds: [encounterId],
    startOffsetMs: phase.start_offset_ms,
    endOffsetMs: phase.end_offset_ms,
  };
}

/** Find the phase represented exactly by the active time-range controller state. */
export function activePhaseForTimeRange(
  selectedEncounters: readonly Encounter[],
  enabled: boolean,
  startOffsetMs: number | null,
  endOffsetMs: number | null,
): string | null {
  if (!enabled || selectedEncounters.length !== 1) return null;

  return selectedEncounters[0].phases?.find((phase) =>
    phase.start_offset_ms === startOffsetMs &&
    phase.end_offset_ms === endOffsetMs
  )?.id ?? null;
}

/** Whether the active time-range controller state is exactly the encounter's ranked window. */
export function rankingWindowActiveForTimeRange(
  selectedEncounters: readonly Encounter[],
  enabled: boolean,
  startOffsetMs: number | null,
  endOffsetMs: number | null,
): boolean {
  if (!enabled || selectedEncounters.length !== 1) return false;

  const window = selectedEncounters[0].ranking_window;
  return window != null &&
    window.start_offset_ms === startOffsetMs &&
    window.end_offset_ms === endOffsetMs;
}
