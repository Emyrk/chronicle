import type { DeathEvent, DeathsResult, ResurrectionEvent } from "./deaths.processor";

export type DeathLogMode = "players" | "enemies";
export type DeathLogEvent = DeathEvent | ResurrectionEvent;

export function isResurrectionEvent(event: DeathLogEvent): event is ResurrectionEvent {
  return "resurrectorID" in event;
}

/** Return the selected encounters' death-log entries in chronological order. */
export function getSortedDeathLogEvents(
  selectedEncounterIDs: string[],
  result: DeathsResult,
  mode: DeathLogMode,
): DeathLogEvent[] {
  const events = mode === "players"
    ? [...result.DeathEvents, ...result.ResurrectionEvents]
    : result.EnemyDeathEvents;

  return events
    .filter((event) => selectedEncounterIDs.includes(event.encounterID))
    .sort((a, b) => a.dateMilli - b.dateMilli);
}
