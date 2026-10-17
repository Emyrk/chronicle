import type { StatusTimelineEvent } from "./status.processor";

export const STATUS_INCOMING_DAMAGE_MILLI = 500;
export const STATUS_INCOMING_HEAL_MILLI = 1_500;

export interface StatusIncomingHealthPreview {
  events: StatusTimelineEvent[];
  damage: number;
  healing: number;
}

export function statusIncomingHealthPreview(
  events: readonly StatusTimelineEvent[],
  cursorMilli: number,
): StatusIncomingHealthPreview {
  const healthEvents = events
    .filter((event) => {
      if (event.kind === "damage") {
        return event.timestampMilli <= cursorMilli + STATUS_INCOMING_DAMAGE_MILLI;
      }
      if (event.kind === "heal") {
        return event.timestampMilli <= cursorMilli + STATUS_INCOMING_HEAL_MILLI;
      }
      return false;
    })
    .sort((a, b) => a.timestampMilli - b.timestampMilli || a.eventIndex - b.eventIndex);

  return {
    events: healthEvents,
    damage: healthEvents
      .filter((event) => event.kind === "damage")
      .reduce((sum, event) => sum + event.amount, 0),
    healing: healthEvents
      .filter((event) => event.kind === "heal")
      .reduce((sum, event) => sum + Math.max(0, event.amount - (event.overheal ?? 0)), 0),
  };
}
