import type { Encounter, EncounterPhase } from "./InstancePage";

export interface PhaseTimeRangeSelection {
  encounterIds: [string];
  startOffsetMs: number;
  endOffsetMs: number;
}

/** Short label used by compact phase chips and narrow proportional cards. */
export function phaseShortLabel(phase: EncounterPhase): string {
  return `P${phase.order + 1}`;
}

/** Width percentage for a phase card relative to its encounter. */
export function phaseWidthPercent(
  phase: EncounterPhase,
  encounter: Encounter,
): number {
  const encounterDuration = new Date(encounter.end_time).getTime() - new Date(encounter.start_time).getTime();
  if (encounterDuration <= 0) return 0;
  return Math.max(0, Math.min(100,
    ((phase.end_offset_ms - phase.start_offset_ms) / encounterDuration) * 100,
  ));
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
