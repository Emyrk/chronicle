import {
  calculateRelativeHealth,
  type RelativeHealthMessage,
} from "@/components/ui/RelativeHealthBar/relativeHealth";

export interface IncomingTimelineEvent {
  offsetMilli: number;
  eventIndex: number;
  type: "damage" | "heal" | "absorbed" | "resource_change" | "aura_cast";
  amount: number;
  overheal?: number;
  blocked?: number;
  absorbed?: number;
}

export interface RelativeHealthSnapshot {
  deficit: number;
  damage: number;
  effectiveHealing: number;
  prevented: number;
  overhealing: number;
}

/** Newest-first display order with deterministic ordering at equal timestamps. */
export function compareIncomingEventsNewestFirst(a: IncomingTimelineEvent, b: IncomingTimelineEvent): number {
  return b.offsetMilli - a.offsetMilli || b.eventIndex - a.eventIndex;
}

export function relativeEventTime(eventOffsetMilli: number, anchorOffsetMilli: number): number {
  return eventOffsetMilli - anchorOffsetMilli;
}

export function visibleIncomingEvents<T extends IncomingTimelineEvent>(
  events: T[],
  anchorOffsetMilli: number,
  windowMilli: number,
): T[] {
  const cutoff = anchorOffsetMilli - windowMilli;
  return events
    .filter((event) => event.offsetMilli >= cutoff && event.offsetMilli <= anchorOffsetMilli)
    .sort(compareIncomingEventsNewestFirst);
}

/**
 * Maps a pointer position to a continuous relative time. Each displayed row spans
 * the interval from the preceding (newer) event to its own timestamp, so the
 * shared cursor remains between events instead of snapping to one.
 */
export function timeAtTimelineY(
  relativeTimesNewestFirst: number[],
  y: number,
  rowHeight: number,
  windowMilli: number,
): number {
  if (relativeTimesNewestFirst.length === 0 || rowHeight <= 0) {
    return Math.max(-windowMilli, Math.min(0, -(y / Math.max(rowHeight, 1)) * windowMilli));
  }

  const row = Math.max(0, Math.min(relativeTimesNewestFirst.length - 1, Math.floor(y / rowHeight)));
  const fraction = Math.max(0, Math.min(1, y / rowHeight - row));
  const newerTime = row === 0 ? 0 : relativeTimesNewestFirst[row - 1];
  const olderTime = relativeTimesNewestFirst[row];
  return Math.max(-windowMilli, Math.min(0, newerTime + (olderTime - newerTime) * fraction));
}

/** Returns the fractional row position for a between-event cursor. */
export function timelineYForTime(
  relativeTimesNewestFirst: number[],
  cursorMilli: number,
  rowHeight: number,
  windowMilli: number,
): number {
  const cursor = Math.max(-windowMilli, Math.min(0, cursorMilli));
  if (relativeTimesNewestFirst.length === 0) return 0;

  for (let row = 0; row < relativeTimesNewestFirst.length; row++) {
    const newerTime = row === 0 ? 0 : relativeTimesNewestFirst[row - 1];
    const olderTime = relativeTimesNewestFirst[row];
    if (cursor <= newerTime && cursor >= olderTime) {
      const duration = newerTime - olderTime;
      const fraction = duration === 0 ? 1 : (newerTime - cursor) / duration;
      return (row + fraction) * rowHeight;
    }
  }

  return relativeTimesNewestFirst.length * rowHeight;
}

export function relativeHealthMessagesAtCursor<T extends IncomingTimelineEvent>(
  events: T[],
  anchorOffsetMilli: number,
  windowMilli: number,
  cursorRelativeMilli: number,
): RelativeHealthMessage[] {
  const cursorOffset = anchorOffsetMilli + Math.max(-windowMilli, Math.min(0, cursorRelativeMilli));
  const cutoff = anchorOffsetMilli - windowMilli;
  const includedEvents = events.filter(
    (event) => event.offsetMilli >= cutoff && event.offsetMilli <= cursorOffset,
  );
  const attachedAbsorbs = new Set(
    includedEvents
      .filter((event) => event.type === "damage" && event.absorbed)
      .map((event) => `${event.eventIndex}:${event.offsetMilli}`),
  );

  return includedEvents.flatMap((event): RelativeHealthMessage[] => {
    const id = `${event.eventIndex}:${event.offsetMilli}:${event.type}`;
    if (event.type === "damage") {
      return [{
        id,
        timestamp: event.offsetMilli,
        sequence: event.eventIndex,
        kind: "damage",
        amount: event.amount,
        prevented: event.absorbed ?? 0,
      }];
    }
    if (event.type === "heal") {
      return [{
        id,
        timestamp: event.offsetMilli,
        sequence: event.eventIndex,
        kind: "healing",
        amount: event.amount,
        overheal: event.overheal ?? 0,
      }];
    }
    if (event.type === "resource_change") {
      return [{
        id,
        timestamp: event.offsetMilli,
        sequence: event.eventIndex,
        kind: "healing",
        amount: Math.max(0, event.amount),
      }];
    }
    if (
      event.type === "absorbed"
      && !attachedAbsorbs.has(`${event.eventIndex}:${event.offsetMilli}`)
    ) {
      return [{
        id,
        timestamp: event.offsetMilli,
        sequence: event.eventIndex,
        kind: "prevented",
        amount: event.amount,
      }];
    }
    return [];
  });
}

export function relativeHealthAtCursor<T extends IncomingTimelineEvent>(
  events: T[],
  anchorOffsetMilli: number,
  windowMilli: number,
  cursorRelativeMilli: number,
): RelativeHealthSnapshot {
  const state = calculateRelativeHealth(
    relativeHealthMessagesAtCursor(events, anchorOffsetMilli, windowMilli, cursorRelativeMilli),
  );
  return {
    deficit: Math.max(0, -state.current),
    damage: state.damage,
    effectiveHealing: state.effectiveHealing,
    prevented: state.prevented,
    overhealing: state.overhealing,
  };
}

/**
 * Converts a shared encounter/fight offset into this breakout's death-relative
 * cursor. Times after death clamp to the top/end; times before the retained
 * history clamp to the bottom/start.
 */
export function relativeCursorForFightOffset(
  fightOffsetMilli: number,
  deathOffsetMilli: number,
  windowMilli: number,
): number {
  return Math.max(-windowMilli, Math.min(0, fightOffsetMilli - deathOffsetMilli));
}

export function syncCursorForDeath(
  syncAbsoluteMilli: number,
  deathAbsoluteMilli: number,
  windowMilli: number,
): number {
  return Math.max(-windowMilli, Math.min(0, syncAbsoluteMilli - deathAbsoluteMilli));
}
