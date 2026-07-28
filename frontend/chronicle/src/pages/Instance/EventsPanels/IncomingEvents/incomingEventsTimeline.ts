export interface IncomingTimelineEvent {
  offsetMilli: number;
  eventIndex: number;
  type: "damage" | "heal" | "absorbed" | "resource_change";
  amount: number;
  overheal?: number;
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

export function relativeHealthAtCursor<T extends IncomingTimelineEvent>(
  events: T[],
  anchorOffsetMilli: number,
  windowMilli: number,
  cursorRelativeMilli: number,
): RelativeHealthSnapshot {
  const cursorOffset = anchorOffsetMilli + Math.max(-windowMilli, Math.min(0, cursorRelativeMilli));
  const cutoff = anchorOffsetMilli - windowMilli;
  let damage = 0;
  let effectiveHealing = 0;
  let prevented = 0;
  let overhealing = 0;
  const includedEvents = events.filter((event) => event.offsetMilli >= cutoff && event.offsetMilli <= cursorOffset);
  const attachedAbsorbs = new Set(
    includedEvents
      .filter((event) => event.type === "damage" && event.absorbed)
      .map((event) => `${event.eventIndex}:${event.offsetMilli}`),
  );

  for (const event of includedEvents) {
    if (event.type === "damage") {
      damage += event.amount;
      if (event.absorbed) {
        prevented += event.absorbed;
        attachedAbsorbs.add(`${event.eventIndex}:${event.offsetMilli}`);
      }
    } else if (event.type === "heal") {
      const over = event.overheal ?? 0;
      effectiveHealing += Math.max(0, event.amount - over);
      overhealing += over;
    } else if (event.type === "resource_change") {
      effectiveHealing += Math.max(0, event.amount);
    } else if (event.type === "absorbed") {
      // The absorbed stream can mirror mitigation attached to the damage event.
      // Combat-log index + timestamp identifies that same source line.
      if (!attachedAbsorbs.has(`${event.eventIndex}:${event.offsetMilli}`)) prevented += event.amount;
    }
  }

  return {
    deficit: Math.max(0, damage - prevented - effectiveHealing),
    damage,
    effectiveHealing,
    prevented,
    overhealing,
  };
}

export function syncCursorForDeath(
  syncAbsoluteMilli: number,
  deathAbsoluteMilli: number,
  windowMilli: number,
): number | null {
  const relative = syncAbsoluteMilli - deathAbsoluteMilli;
  if (relative < -windowMilli) return null;
  return Math.min(0, relative);
}
