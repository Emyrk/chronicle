import { calculateRelativeHealth, type RelativeHealthMessage, type RelativeHealthState } from "@/components/ui/RelativeHealthBar/relativeHealth";
import type { StatusEncounter, StatusTimelineEvent, StatusUnitTimeline } from "./status.processor";
import { DEFAULT_STATUS_WINDOW } from "./statusWindow";

export const STATUS_HISTORY_MILLI = DEFAULT_STATUS_WINDOW.historyMilli;
export const STATUS_FUTURE_MILLI = DEFAULT_STATUS_WINDOW.futureMilli;
export const OVERHEAL_EXPIRE_MILLI = 1_000;

export interface StatusUnitSnapshot {
  unit: StatusUnitTimeline;
  deficit: number;
  netChange: number;
  relativeHealthState: RelativeHealthState;
  relativeHealthMessages: RelativeHealthMessage[];
  damage: number;
  effectiveHealing: number;
  absorbed: number;
  dead: boolean;
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

function healthMessages(events: StatusTimelineEvent[], startMilli: number, cursorMilli: number): RelativeHealthMessage[] {
  return events.flatMap((event): RelativeHealthMessage[] => {
    if (event.timestampMilli < startMilli || event.timestampMilli > cursorMilli) return [];
    const common = {
      id: `${event.eventIndex}:${event.timestampMilli}:${event.kind}`,
      timestamp: event.timestampMilli,
      sequence: event.eventIndex,
    };
    if (event.kind === "damage") return [{ ...common, kind: "damage", amount: event.amount }];
    if (event.kind === "heal") return [{ ...common, kind: "healing", amount: event.amount, overheal: event.overheal }];
    if (event.kind === "absorbed") return [{ ...common, kind: "prevented", amount: event.amount }];
    return [];
  });
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

export function isStatusUnitDead(
  orderedEvents: StatusTimelineEvent[],
  cursorMilli: number,
): boolean {
  for (let index = orderedEvents.length - 1; index >= 0; index--) {
    const event = orderedEvents[index];
    if (event.timestampMilli > cursorMilli) continue;
    // Until the parser exposes an authoritative resurrection event, any later
    // activity from or affecting the unit is evidence that it became active again.
    return event.kind === "death";
  }
  return false;
}

export function snapshotStatusUnit(
  unit: StatusUnitTimeline,
  cursorMilli: number,
  historyMilli = STATUS_HISTORY_MILLI,
  futureMilli = STATUS_FUTURE_MILLI,
): StatusUnitSnapshot {
  const ordered = [...unit.events].sort(compareStatusEvents);
  const startMilli = cursorMilli - historyMilli;
  const endMilli = cursorMilli + futureMilli;
  const relativeHealthMessages = healthMessages(ordered, startMilli, cursorMilli);
  const health = calculateRelativeHealth(relativeHealthMessages);
  const relativeHealthState = expireOverhealStripe(health, relativeHealthMessages, ordered, cursorMilli);
  const recentActivity = ordered.filter((event) => event.timestampMilli >= startMilli && event.timestampMilli <= cursorMilli);
  const incoming = ordered.filter((event) => event.timestampMilli > cursorMilli && event.timestampMilli <= endMilli);

  return {
    unit,
    deficit: Math.max(0, -health.current),
    netChange: health.current,
    relativeHealthState,
    relativeHealthMessages,
    damage: health.damage,
    effectiveHealing: health.effectiveHealing,
    absorbed: health.prevented,
    dead: isStatusUnitDead(ordered, cursorMilli),
    activeCast: findActiveCast(ordered, cursorMilli),
    recentActivity,
    incoming,
    incomingDamage: incoming.filter((event) => event.kind === "damage").reduce((sum, event) => sum + event.amount, 0),
    incomingHealing: incoming.filter((event) => event.kind === "heal").reduce((sum, event) => sum + Math.max(0, event.amount - (event.overheal ?? 0)), 0),
  };
}
