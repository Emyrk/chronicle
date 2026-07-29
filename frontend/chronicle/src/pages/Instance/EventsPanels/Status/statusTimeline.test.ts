import { describe, expect, it } from "vitest";
import type { StatusEncounter, StatusTimelineEvent, StatusUnitTimeline } from "./status.processor";
import { expireOverhealStripe, selectStatusEncounter, snapshotStatusUnit, statusCursorMilli } from "./statusTimeline";
import { calculateRelativeHealth, type RelativeHealthMessage } from "@/components/ui/RelativeHealthBar/relativeHealth";

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
    targetId: "unit",
    ...overrides,
  };
}

function unit(events: StatusTimelineEvent[]): StatusUnitTimeline {
  return {
    unitId: "unit",
    name: "Unit",
    className: "UNKNOWN",
    kind: "unit",
    ownerId: null,
    events,
  };
}

function encounter(id: string, startMilli: number, endMilli: number): StatusEncounter {
  return { encounterId: id, startMilli, endMilli, units: new Map() };
}

describe("snapshotStatusUnit", () => {
  it("keeps post-cursor damage out of current state while exposing it as incoming", () => {
    const snapshot = snapshotStatusUnit(unit([
      event({ timestampMilli: 1_000, eventIndex: 1, kind: "damage", amount: 500 }),
      event({ timestampMilli: 2_000, eventIndex: 2, kind: "heal", amount: 300, overheal: 100 }),
      event({ timestampMilli: 6_000, eventIndex: 3, kind: "damage", amount: 900 }),
    ]), 5_000);

    expect(snapshot.damage).toBe(500);
    expect(snapshot.effectiveHealing).toBe(200);
    expect(snapshot.deficit).toBe(300);
    expect(snapshot.incomingDamage).toBe(900);
  });

  it("finds an active cast and cancels it when a matching completion arrives", () => {
    const start = event({
      timestampMilli: 4_000,
      eventIndex: 1,
      kind: "cast_start",
      spellId: 7,
      label: "Long Cast",
      durationMilli: 3_000,
    });
    expect(snapshotStatusUnit(unit([start]), 5_000).activeCast?.label).toBe("Long Cast");

    const completed = event({ timestampMilli: 4_500, eventIndex: 2, kind: "cast", spellId: 7 });
    expect(snapshotStatusUnit(unit([start, completed]), 5_000).activeCast).toBeNull();
  });

  it("marks a unit dead only after the cursor reaches its death", () => {
    const death = event({ timestampMilli: 6_000, eventIndex: 1, kind: "death" });
    expect(snapshotStatusUnit(unit([death]), 5_000).dead).toBe(false);
    expect(snapshotStatusUnit(unit([death]), 6_000).dead).toBe(true);
  });

  it("marks a dead unit active again when later activity indicates a revival", () => {
    const death = event({ timestampMilli: 6_000, eventIndex: 1, kind: "death" });
    const revivedActivity = event({ timestampMilli: 8_000, eventIndex: 2, kind: "heal", amount: 500 });
    const timeline = unit([death, revivedActivity]);

    expect(snapshotStatusUnit(timeline, 7_000).dead).toBe(true);
    expect(snapshotStatusUnit(timeline, 8_000).dead).toBe(false);
  });

  it("uses event ordering to detect same-timestamp revival activity", () => {
    const death = event({ timestampMilli: 6_000, eventIndex: 1, kind: "death" });
    const revivedActivity = event({ timestampMilli: 6_000, eventIndex: 2, kind: "cast", amount: 0 });

    expect(snapshotStatusUnit(unit([revivedActivity, death]), 6_000).dead).toBe(false);
  });

  it("does not revive a unit from future activity before the cursor reaches it", () => {
    const death = event({ timestampMilli: 6_000, eventIndex: 1, kind: "death" });
    const futureActivity = event({ timestampMilli: 8_000, eventIndex: 2, kind: "damage", amount: 100 });

    expect(snapshotStatusUnit(unit([death, futureActivity]), 7_999).dead).toBe(true);
  });
});

describe("expireOverhealStripe", () => {
  function healMsg(timestamp: number, sequence: number, amount: number, overheal: number): RelativeHealthMessage {
    return { id: `${sequence}:${timestamp}:healing`, timestamp, sequence, kind: "healing", amount, overheal };
  }

  function damageMsg(timestamp: number, sequence: number, amount: number): RelativeHealthMessage {
    return { id: `${sequence}:${timestamp}:damage`, timestamp, sequence, kind: "damage", amount };
  }

  it("keeps overheal visible when cursor is within 1000ms and no subsequent event", () => {
    const msgs = [healMsg(2_000, 1, 500, 200)];
    const state = calculateRelativeHealth(msgs);
    const events = [event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 })];

    const result = expireOverhealStripe(state, msgs, events, 2_500);
    expect(result.lastTransition?.overheal).toBe(200);
  });

  it("expires overheal when cursor exceeds 1000ms past the heal event", () => {
    const msgs = [healMsg(2_000, 1, 500, 200)];
    const state = calculateRelativeHealth(msgs);
    const events = [event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 })];

    // At exactly 1000ms: still visible
    const atBoundary = expireOverhealStripe(state, msgs, events, 3_000);
    expect(atBoundary.lastTransition?.overheal).toBe(200);

    // At 1001ms: expired
    const pastBoundary = expireOverhealStripe(state, msgs, events, 3_001);
    expect(pastBoundary.lastTransition?.overheal).toBe(0);
  });

  it("expires overheal when any subsequent event occurs, even before 1000ms", () => {
    const msgs = [healMsg(2_000, 1, 500, 200)];
    const state = calculateRelativeHealth(msgs);
    // A cast event at 2_100 is not a health message but is a unit event
    const events = [
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
      event({ timestampMilli: 2_100, eventIndex: 2, kind: "cast", amount: 0 }),
    ];

    const result = expireOverhealStripe(state, msgs, events, 2_500);
    expect(result.lastTransition?.overheal).toBe(0);
  });

  it("expires overheal on subsequent event at same timestamp but higher index", () => {
    const msgs = [healMsg(2_000, 1, 500, 200)];
    const state = calculateRelativeHealth(msgs);
    const events = [
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
      event({ timestampMilli: 2_000, eventIndex: 2, kind: "damage", amount: 100 }),
    ];

    const result = expireOverhealStripe(state, msgs, events, 2_500);
    expect(result.lastTransition?.overheal).toBe(0);
  });

  it("does not alter state when lastTransition is damage", () => {
    const msgs = [
      healMsg(2_000, 1, 500, 200),
      damageMsg(2_500, 2, 100),
    ];
    const state = calculateRelativeHealth(msgs);
    const events = [
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
      event({ timestampMilli: 2_500, eventIndex: 2, kind: "damage", amount: 100 }),
    ];

    const result = expireOverhealStripe(state, msgs, events, 5_000);
    expect(result).toBe(state); // same reference — no modification
  });

  it("does not alter state when lastTransition has no overheal", () => {
    const msgs = [healMsg(2_000, 1, 500, 0)];
    const state = calculateRelativeHealth(msgs);
    const events = [event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500 })];

    const result = expireOverhealStripe(state, msgs, events, 5_000);
    expect(result).toBe(state);
  });

  it("preserves rest of state when overheal is expired", () => {
    const msgs = [damageMsg(1_000, 0, 300), healMsg(2_000, 1, 500, 200)];
    const state = calculateRelativeHealth(msgs);
    const events = [
      event({ timestampMilli: 1_000, eventIndex: 0, kind: "damage", amount: 300 }),
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
    ];

    const result = expireOverhealStripe(state, msgs, events, 5_000);
    expect(result.lastTransition?.overheal).toBe(0);
    // All non-transition fields unchanged
    expect(result.current).toBe(state.current);
    expect(result.damage).toBe(state.damage);
    expect(result.effectiveHealing).toBe(state.effectiveHealing);
    expect(result.overhealing).toBe(state.overhealing);
    expect(result.minimum).toBe(state.minimum);
    expect(result.maximum).toBe(state.maximum);
    // Transition fields other than overheal unchanged
    expect(result.lastTransition?.kind).toBe("healing");
    expect(result.lastTransition?.from).toBe(state.lastTransition?.from);
    expect(result.lastTransition?.to).toBe(state.lastTransition?.to);
    expect(result.lastTransition?.amount).toBe(state.lastTransition?.amount);
  });
});

describe("snapshotStatusUnit overheal expiry", () => {
  it("shows overheal stripe when cursor is at the heal event", () => {
    const snapshot = snapshotStatusUnit(unit([
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
    ]), 2_000);
    expect(snapshot.relativeHealthState.lastTransition?.overheal).toBe(200);
  });

  it("hides overheal stripe after 1000ms", () => {
    const snapshot = snapshotStatusUnit(unit([
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
    ]), 3_001);
    expect(snapshot.relativeHealthState.lastTransition?.overheal).toBe(0);
  });

  it("hides overheal stripe when next event arrives before 1000ms", () => {
    const snapshot = snapshotStatusUnit(unit([
      event({ timestampMilli: 2_000, eventIndex: 1, kind: "heal", amount: 500, overheal: 200 }),
      event({ timestampMilli: 2_200, eventIndex: 2, kind: "damage", amount: 50 }),
    ]), 2_500);
    expect(snapshot.relativeHealthState.lastTransition?.overheal).toBe(0);
  });
});

describe("status encounter cursor", () => {
  it("selects the encounter at or immediately before the cursor", () => {
    const encounters = new Map([
      ["one", encounter("one", 1_000, 5_000)],
      ["two", encounter("two", 10_000, 15_000)],
    ]);
    expect(selectStatusEncounter(encounters, ["one", "two"], 12_000)?.encounterId).toBe("two");
    expect(selectStatusEncounter(encounters, ["one", "two"], 8_000)?.encounterId).toBe("one");
  });

  it("uses encounter end outside Sync without pinning Sync to the last filtered event", () => {
    const selected = encounter("one", 1_000, 5_000);
    expect(statusCursorMilli(selected, null, false)).toBe(5_000);
    expect(statusCursorMilli(selected, new Date(500), true)).toBe(1_000);
    expect(statusCursorMilli(selected, new Date(8_000), true)).toBe(8_000);
  });
});
