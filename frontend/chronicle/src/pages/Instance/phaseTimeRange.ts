import type { Encounter, EncounterPhase } from "./InstancePage";

export interface PhaseTimeRangeSelection {
  encounterIds: [string];
  startOffsetMs: number;
  endOffsetMs: number;
}

/** Convert a phase row click into the existing single-encounter time-range state. */
export function phaseTimeRangeSelection(
  phase: EncounterPhase,
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
