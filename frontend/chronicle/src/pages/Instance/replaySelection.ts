export interface SelectedEncounterTimes {
  start: string | undefined;
  end: string | undefined;
}

/** Return the selected encounter start when an active replay should reset. */
export function getReplayResetTimestamp(
  previous: SelectedEncounterTimes,
  next: SelectedEncounterTimes,
  replayEnabled: boolean,
): Date | null {
  if (!replayEnabled || !next.start || !next.end) return null;
  if (previous.start === next.start && previous.end === next.end) return null;
  return new Date(next.start);
}
