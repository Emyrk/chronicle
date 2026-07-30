import { describe, expect, it } from "vitest";
import type {
  StatusEncounter,
  StatusTimelineEvent,
  StatusUnitTimeline,
} from "../Status/status.processor";
import { healerTargetHealthSnapshot } from "./healerTargetHealth";

function event(overrides: Partial<StatusTimelineEvent>): StatusTimelineEvent {
  return {
    timestampMilli: 0,
    offsetMilli: 0,
    eventIndex: 0,
    kind: "damage",
    amount: 0,
    spellId: null,
    label: "event",
    sourceId: "source",
    sourceName: "Source",
    targetId: "target",
    ...overrides,
  };
}

function encounter(events: StatusTimelineEvent[]): StatusEncounter {
  const unit: StatusUnitTimeline = {
    unitId: "target",
    name: "Target",
    className: "WARRIOR",
    kind: "player",
    ownerId: null,
    events,
  };
  return {
    encounterId: "encounter",
    startMilli: 0,
    endMilli: 20_000,
    units: new Map([[unit.unitId, unit]]),
  };
}

describe("healerTargetHealthSnapshot", () => {
  it("includes the target's full fight history before a short cast window", () => {
    const snapshot = healerTargetHealthSnapshot(encounter([
      event({ timestampMilli: 1_000, eventIndex: 1, kind: "damage", amount: 2_000 }),
      event({ timestampMilli: 7_000, eventIndex: 2, kind: "heal", amount: 500, overheal: 0 }),
      event({ timestampMilli: 11_000, eventIndex: 3, kind: "heal", amount: 1_000, overheal: 250 }),
    ]), "target", 10_000);

    expect(snapshot?.relativeHealthState.current).toBe(-1_500);
    expect(snapshot?.relativeHealthState.damage).toBe(2_000);
    expect(snapshot?.relativeHealthState.effectiveHealing).toBe(500);
  });

  it("includes the landed heal only after the Replay cursor reaches it", () => {
    const timeline = encounter([
      event({ timestampMilli: 1_000, eventIndex: 1, kind: "damage", amount: 2_000 }),
      event({ timestampMilli: 11_000, eventIndex: 2, kind: "heal", amount: 1_000, overheal: 250 }),
    ]);

    expect(healerTargetHealthSnapshot(timeline, "target", 10_999)?.relativeHealthState.current).toBe(-2_000);
    expect(healerTargetHealthSnapshot(timeline, "target", 11_000)?.relativeHealthState.current).toBe(-1_250);
  });
});
