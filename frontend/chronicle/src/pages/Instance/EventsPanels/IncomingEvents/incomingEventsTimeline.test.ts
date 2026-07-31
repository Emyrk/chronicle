import { describe, expect, it } from "vitest";
import {
  compareIncomingEventsNewestFirst,
  incomingEventsWindowMilli,
  relativeCursorForFightOffset,
  relativeHealthAtCursor,
  syncCursorForDeath,
  timeAtTimelineY,
  timelineYForTime,
  visibleIncomingEvents,
  type IncomingTimelineEvent,
} from "./incomingEventsTimeline";

function event(overrides: Partial<IncomingTimelineEvent>): IncomingTimelineEvent {
  return {
    offsetMilli: 0,
    eventIndex: 0,
    type: "damage",
    amount: 0,
    ...overrides,
  };
}

describe("incoming events timeline", () => {
  it("uses combat-log order to stabilize events at the same timestamp", () => {
    const events = [event({ offsetMilli: 1000, eventIndex: 2 }), event({ offsetMilli: 1000, eventIndex: 9 })];
    expect(events.sort(compareIncomingEventsNewestFirst).map((item) => item.eventIndex)).toEqual([9, 2]);
  });

  it("filters a configurable window and keeps newest-first order", () => {
    const events = [
      event({ offsetMilli: 69_999, eventIndex: 1 }),
      event({ offsetMilli: 70_000, eventIndex: 2 }),
      event({ offsetMilli: 85_000, eventIndex: 3 }),
      event({ offsetMilli: 100_000, eventIndex: 4 }),
      event({ offsetMilli: 100_001, eventIndex: 5 }),
    ];
    expect(visibleIncomingEvents(events, 100_000, 30_000).map((item) => item.offsetMilli)).toEqual([100_000, 85_000, 70_000]);
  });

  it("derives an All window from the oldest supplied event before the anchor", () => {
    const events = [
      event({ offsetMilli: 25_000, eventIndex: 1 }),
      event({ offsetMilli: 70_000, eventIndex: 2 }),
      event({ offsetMilli: 110_000, eventIndex: 3 }),
    ];

    const windowMilli = incomingEventsWindowMilli("all", events, 100_000);

    expect(windowMilli).toBe(75_000);
    expect(visibleIncomingEvents(events, 100_000, windowMilli).map((item) => item.offsetMilli)).toEqual([70_000, 25_000]);
    expect(timelineYForTime([-30_000, -75_000], -75_000, 28, windowMilli)).toBe(56);
  });

  it("keeps All window math finite for empty and zero-duration histories", () => {
    expect(incomingEventsWindowMilli("all", [], 100_000)).toBe(1);
    expect(incomingEventsWindowMilli("all", [event({ offsetMilli: 100_000 })], 100_000)).toBe(1);
    expect(Number.isFinite(timeAtTimelineY([], 10, 28, incomingEventsWindowMilli("all", [], 100_000)))).toBe(true);
  });

  it("converts numeric window selections to milliseconds", () => {
    expect(incomingEventsWindowMilli(30, [], 100_000)).toBe(30_000);
  });

  it("round-trips a cursor between event rows without snapping", () => {
    const times = [-1_000, -5_000, -12_000];
    const cursor = -3_000;
    const y = timelineYForTime(times, cursor, 28, 30_000);
    expect(y).toBeGreaterThan(28);
    expect(y).toBeLessThan(56);
    expect(timeAtTimelineY(times, y, 28, 30_000)).toBeCloseTo(cursor, 5);
  });

  it("calculates health from actual damage and effective healing without double-counting absorbs", () => {
    const events = [
      event({ offsetMilli: 75_000, eventIndex: 1, type: "damage", amount: 10_000, absorbed: 2_000 }),
      event({ offsetMilli: 75_000, eventIndex: 1, type: "absorbed", amount: 2_000 }),
      event({ offsetMilli: 80_000, eventIndex: 2, type: "absorbed", amount: 1_000 }),
      event({ offsetMilli: 90_000, eventIndex: 3, type: "heal", amount: 7_000, overheal: 3_000 }),
    ];
    expect(relativeHealthAtCursor(events, 100_000, 30_000, 0)).toEqual({
      deficit: 6_000,
      damage: 10_000,
      effectiveHealing: 4_000,
      prevented: 3_000,
      overhealing: 3_000,
    });
  });

  it("syncs death breakouts by fight offset instead of time before death", () => {
    const fightCursor = 80_000;
    expect(relativeCursorForFightOffset(fightCursor, 100_000, 30_000)).toBe(-20_000);
    expect(relativeCursorForFightOffset(fightCursor, 105_000, 30_000)).toBe(-25_000);
  });

  it("clamps a fight-offset cursor to the visible window edges", () => {
    expect(relativeCursorForFightOffset(69_999, 100_000, 30_000)).toBe(-30_000);
    expect(relativeCursorForFightOffset(100_001, 100_000, 30_000)).toBe(0);
    expect(relativeCursorForFightOffset(70_000, 100_000, 30_000)).toBe(-30_000);
    expect(relativeCursorForFightOffset(100_000, 100_000, 30_000)).toBe(0);
  });

  it("maps absolute Sync playback and clamps it to each death window", () => {
    expect(syncCursorForDeath(60_000, 100_000, 30_000)).toBe(-30_000);
    expect(syncCursorForDeath(75_000, 100_000, 30_000)).toBe(-25_000);
    expect(syncCursorForDeath(100_000, 100_000, 30_000)).toBe(0);
    expect(syncCursorForDeath(120_000, 100_000, 30_000)).toBe(0);
  });
});
