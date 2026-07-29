import { calculateRelativeHealth, type RelativeHealthMessage, type RelativeHealthState } from "@/components/ui/RelativeHealthBar/relativeHealth";
import type { PlayerLifeTransition } from "../processors/playerLifeState.processor";
import type { StatusEncounter, StatusTimelineEvent, StatusUnitTimeline } from "./status.processor";
import { DEFAULT_STATUS_WINDOW } from "./statusWindow";

export const STATUS_HISTORY_MILLI = DEFAULT_STATUS_WINDOW.historyMilli;
export const STATUS_FUTURE_MILLI = DEFAULT_STATUS_WINDOW.futureMilli;
export const OVERHEAL_EXPIRE_MILLI = 1_000;
export const RELATIVE_HEALTH_DEATH_RESET_MILLI = 1_000;

export interface StatusRelativeHealthBounds {
  minimum: number;
  maximum: number;
}

export interface StatusUnitSnapshot {
  unit: StatusUnitTimeline;
  deficit: number;
  netChange: number;
  relativeHealthState: RelativeHealthState;
  relativeHealthBounds: StatusRelativeHealthBounds;
  relativeHealthMessages: RelativeHealthMessage[];
  damage: number;
  effectiveHealing: number;
  absorbed: number;
  dead: boolean;
  deadSinceMilli: number | null;
  activeCast: StatusTimelineEvent | null;
  recentActivity: StatusTimelineEvent[];
  incoming: StatusTimelineEvent[];
  incomingDamage: number;
  incomingHealing: number;
}

export function compareStatusEvents(a: StatusTimelineEvent, b: StatusTimelineEvent): number {
  return a.timestampMilli - b.timestampMilli || a.eventIndex - b.eventIndex || a.kind.localeCompare(b.kind);
}

export function selectStatusEncounter(
  encounters: Map<string, StatusEncounter>,
  selectedEncounterIds: string[],
  cursorMilli: number | null,
): StatusEncounter | null {
  const selected = selectedEncounterIds
    .map((id) => encounters.get(id))
    .filter((encounter): encounter is StatusEncounter => encounter !== undefined)
    .sort((a, b) => a.startMilli - b.startMilli);
  if (selected.length === 0) return null;
  if (cursorMilli === null) return selected[selected.length - 1];
  return [...selected].reverse().find((encounter) => encounter.startMilli <= cursorMilli) ?? selected[0];
}

export function statusCursorMilli(encounter: StatusEncounter, syncTimestamp: Date | null, syncEnabled: boolean): number {
  if (syncEnabled && syncTimestamp) {
    // The last event admitted by this panel's filters is not necessarily the end
    // of the encounter. Do not pin playback to stale activity after that event.
    return Math.max(encounter.startMilli, syncTimestamp.getTime());
  }
  return encounter.endMilli;
}

function healthMessage(event: StatusTimelineEvent): RelativeHealthMessage | null {
  const common = {
    id: `${event.eventIndex}:${event.timestampMilli}:${event.kind}`,
    timestamp: event.timestampMilli,
    sequence: event.eventIndex,
  };
  if (event.kind === "damage") return { ...common, kind: "damage", amount: event.amount };
  if (event.kind === "heal") return { ...common, kind: "healing", amount: event.amount, overheal: event.overheal };
  if (event.kind === "absorbed") return { ...common, kind: "prevented", amount: event.amount };
  return null;
}

function healthMessages(events: StatusTimelineEvent[], startMilli: number, cursorMilli: number): RelativeHealthMessage[] {
  return events.flatMap((event): RelativeHealthMessage[] => {
    if (event.timestampMilli < startMilli || event.timestampMilli > cursorMilli) return [];
    const message = healthMessage(event);
    return message ? [message] : [];
  });
}

function deathBoundaries(
  unit: StatusUnitTimeline,
  lifeTransitions?: readonly PlayerLifeTransition[],
): Array<{ timestampMilli: number; eventIndex: number }> {
  if (lifeTransitions) {
    return lifeTransitions
      .filter((transition) => !transition.alive)
      .map((transition) => ({ timestampMilli: transition.timestampMilli, eventIndex: transition.eventIndex }));
  }
  return unit.events
    .filter((event) => event.kind === "death")
    .map((event) => ({ timestampMilli: event.timestampMilli, eventIndex: event.eventIndex }));
}

export function statusUnitRelativeHealthBounds(
  unit: StatusUnitTimeline,
  lifeTransitions?: readonly PlayerLifeTransition[],
): StatusRelativeHealthBounds {
  const healthEvents = unit.events.filter((event) => healthMessage(event) !== null).sort(compareStatusEvents);
  const deaths = deathBoundaries(unit, lifeTransitions).sort(
    (a, b) => a.timestampMilli - b.timestampMilli || a.eventIndex - b.eventIndex,
  );
  let segment: RelativeHealthMessage[] = [];
  let minimum = 0;
  let maximum = 0;
  let deathIndex = 0;

  const includeSegment = () => {
    const state = calculateRelativeHealth(segment);
    minimum = Math.min(minimum, state.minimum);
    maximum = Math.max(maximum, state.maximum);
    segment = [];
  };

  for (const event of healthEvents) {
    while (
      deathIndex < deaths.length
      && (deaths[deathIndex].timestampMilli < event.timestampMilli
        || (deaths[deathIndex].timestampMilli === event.timestampMilli
          && deaths[deathIndex].eventIndex < event.eventIndex))
    ) {
      includeSegment();
      deathIndex++;
    }
    const message = healthMessage(event);
    if (message) segment.push(message);
  }
  includeSegment();

  return { minimum, maximum };
}

function relativeHealthEventsAtCursor(
  unit: StatusUnitTimeline,
  orderedEvents: StatusTimelineEvent[],
  cursorMilli: number,
  lifeTransitions?: readonly PlayerLifeTransition[],
): StatusTimelineEvent[] {
  const resetBeforeMilli = cursorMilli - RELATIVE_HEALTH_DEATH_RESET_MILLI;
  const resetDeath = deathBoundaries(unit, lifeTransitions).reverse().find(
    (death) => death.timestampMilli <= resetBeforeMilli,
  );
  if (!resetDeath) return orderedEvents;
  return orderedEvents.filter((event) =>
    event.timestampMilli > resetDeath.timestampMilli
    || (event.timestampMilli === resetDeath.timestampMilli && event.eventIndex > resetDeath.eventIndex),
  );
}

function findActiveCast(events: StatusTimelineEvent[], cursorMilli: number): StatusTimelineEvent | null {
  const starts = events
    .filter((event) => event.kind === "cast_start" && event.timestampMilli <= cursorMilli && (event.durationMilli ?? 0) > 0)
    .sort(compareStatusEvents);
  for (let index = starts.length - 1; index >= 0; index--) {
    const start = starts[index];
    const end = start.timestampMilli + (start.durationMilli ?? 0);
    if (end <= cursorMilli) continue;
    const stopped = events.some((event) =>
      event.timestampMilli >= start.timestampMilli
      && event.timestampMilli <= cursorMilli
      && event.spellId === start.spellId
      && (event.kind === "cast" || event.kind === "cast_fail"),
    );
    if (!stopped) return start;
  }
  return null;
}

/**
 * Zero-out the overheal on the lastTransition when it should no longer be
 * visible.  The stripe expires when:
 *   1. The cursor is more than {@link OVERHEAL_EXPIRE_MILLI} past the healing
 *      event that produced the transition, OR
 *   2. Any subsequent event for the unit occurs after the healing event
 *      (even before the time threshold).
 *
 * This is a Status-specific presentation concern — the underlying
 * {@link RelativeHealthState} from `calculateRelativeHealth` is not altered.
 */
export function expireOverhealStripe(
  state: RelativeHealthState,
  healthMsgs: RelativeHealthMessage[],
  allEvents: StatusTimelineEvent[],
  cursorMilli: number,
): RelativeHealthState {
  const t = state.lastTransition;
  if (!t || t.kind !== "healing" || t.overheal <= 0) return state;

  // The lastTransition was set by the last healing message that had
  // healing > 0 or overheal > 0.  Find its timestamp/sequence.
  let healTimestamp = -Infinity;
  let healSequence = -Infinity;
  for (const m of healthMsgs) {
    if (m.kind === "healing" && (Math.max(0, m.amount - Math.max(0, m.overheal ?? 0)) > 0 || (m.overheal ?? 0) > 0)) {
      healTimestamp = m.timestamp;
      healSequence = m.sequence;
    }
  }
  if (healTimestamp === -Infinity) return state;

  // Condition 1: cursor moved past the expiry window.
  if (cursorMilli - healTimestamp > OVERHEAL_EXPIRE_MILLI) {
    return { ...state, lastTransition: { ...t, overheal: 0 } };
  }

  // Condition 2: any subsequent event for this unit has occurred.
  const hasSubsequent = allEvents.some(
    (e) =>
      e.timestampMilli <= cursorMilli &&
      (e.timestampMilli > healTimestamp ||
        (e.timestampMilli === healTimestamp && e.eventIndex > healSequence)),
  );
  if (hasSubsequent) {
    return { ...state, lastTransition: { ...t, overheal: 0 } };
  }

  return state;
}

export function statusUnitDeadSince(
  orderedEvents: StatusTimelineEvent[],
  cursorMilli: number,
): number | null {
  let deadSinceMilli: number | null = null;
  for (const event of orderedEvents) {
    if (event.timestampMilli > cursorMilli) break;
    if (event.kind === "death") {
      deadSinceMilli = event.timestampMilli;
    } else if (
      deadSinceMilli !== null
      && event.timestampMilli - deadSinceMilli > RELATIVE_HEALTH_DEATH_RESET_MILLI
      && (event.kind === "cast_start" || event.kind === "cast" || event.kind === "cast_fail")
    ) {
      deadSinceMilli = null;
    }
  }
  return deadSinceMilli;
}

export function isStatusUnitDead(
  orderedEvents: StatusTimelineEvent[],
  cursorMilli: number,
): boolean {
  return statusUnitDeadSince(orderedEvents, cursorMilli) !== null;
}

export function snapshotStatusUnit(
  unit: StatusUnitTimeline,
  cursorMilli: number,
  historyMilli = STATUS_HISTORY_MILLI,
  futureMilli = STATUS_FUTURE_MILLI,
  relativeHealthBounds = statusUnitRelativeHealthBounds(unit),
  lifeTransitions?: readonly PlayerLifeTransition[],
): StatusUnitSnapshot {
  const ordered = [...unit.events].sort(compareStatusEvents);
  const startMilli = cursorMilli - historyMilli;
  const endMilli = cursorMilli + futureMilli;
  // Keep each life in encounter coordinates, then start a new relative-health
  // segment one second after death. Encounter-wide bounds include every segment.
  const healthEvents = relativeHealthEventsAtCursor(unit, ordered, cursorMilli, lifeTransitions);
  const relativeHealthMessages = healthMessages(healthEvents, Number.NEGATIVE_INFINITY, cursorMilli);
  const health = calculateRelativeHealth(relativeHealthMessages);
  const relativeHealthState = expireOverhealStripe(health, relativeHealthMessages, ordered, cursorMilli);
  const lastLifeTransition = lifeTransitions
    ? [...lifeTransitions].reverse().find((transition) => transition.timestampMilli <= cursorMilli) ?? null
    : null;
  const deadSinceMilli = lifeTransitions
    ? lastLifeTransition && !lastLifeTransition.alive ? lastLifeTransition.timestampMilli : null
    : statusUnitDeadSince(ordered, cursorMilli);
  const recentActivity = ordered.filter((event) => event.timestampMilli >= startMilli && event.timestampMilli <= cursorMilli);
  const incoming = ordered.filter((event) => event.timestampMilli > cursorMilli && event.timestampMilli <= endMilli);

  return {
    unit,
    deficit: Math.max(0, -health.current),
    netChange: health.current,
    relativeHealthState,
    relativeHealthBounds,
    relativeHealthMessages,
    damage: health.damage,
    effectiveHealing: health.effectiveHealing,
    absorbed: health.prevented,
    dead: deadSinceMilli !== null,
    deadSinceMilli,
    activeCast: findActiveCast(ordered, cursorMilli),
    recentActivity,
    incoming,
    incomingDamage: incoming.filter((event) => event.kind === "damage").reduce((sum, event) => sum + event.amount, 0),
    incomingHealing: incoming.filter((event) => event.kind === "heal").reduce((sum, event) => sum + Math.max(0, event.amount - (event.overheal ?? 0)), 0),
  };
}
