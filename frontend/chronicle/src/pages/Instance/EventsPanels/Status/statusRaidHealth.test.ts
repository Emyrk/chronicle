import { describe, expect, it } from "vitest";
import type { StatusTimelineEvent, StatusUnitTimeline } from "./status.processor";
import {
  createStatusRaidHealthModel,
  statusRaidHealthAt,
  statusRaidHealthTimeline,
} from "./statusRaidHealth";

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

function unit(unitId: string, events: StatusTimelineEvent[]): StatusUnitTimeline {
  return {
    unitId,
    name: unitId,
    className: "UNKNOWN",
    kind: "player",
    ownerId: null,
    events,
  };
}

describe("Status raid health estimate", () => {
  it("starts full and uses observed deficits to estimate later health", () => {
    const model = createStatusRaidHealthModel([
      unit("one", [event({ timestampMilli: 1_000, eventIndex: 1, amount: 600 })]),
      unit("two", [event({ timestampMilli: 1_000, eventIndex: 2, amount: 300 })]),
    ]);

    expect(statusRaidHealthAt(model, 0)).toEqual({ percent: 100, alive: 2, total: 2 });
    const damaged = statusRaidHealthAt(model, 1_000);
    expect(damaged.percent).toBeGreaterThan(0);
    expect(damaged.percent).toBeLessThan(100);
    expect(damaged.alive).toBe(2);
  });

  it("counts dead players as zero and identifies a wipe", () => {
    const model = createStatusRaidHealthModel([
      unit("one", [event({ timestampMilli: 1_000, eventIndex: 1, kind: "death" })]),
      unit("two", [event({ timestampMilli: 2_000, eventIndex: 2, kind: "death" })]),
    ]);

    expect(statusRaidHealthAt(model, 1_500)).toEqual({ percent: 50, alive: 1, total: 2 });
    expect(statusRaidHealthAt(model, 2_000)).toEqual({ percent: 0, alive: 0, total: 2 });
  });

  it("keeps players dead through trailing damage and lingering healing", () => {
    const model = createStatusRaidHealthModel([
      unit("one", [
        event({ timestampMilli: 1_000, eventIndex: 1, kind: "death" }),
        event({ timestampMilli: 1_001, eventIndex: 2, kind: "damage", amount: 100 }),
        event({ timestampMilli: 5_000, eventIndex: 3, kind: "heal", amount: 500 }),
      ]),
    ]);

    expect(statusRaidHealthAt(model, 6_000)).toEqual({ percent: 0, alive: 0, total: 1 });
  });

  it("restores an active player after a later cast", () => {
    const model = createStatusRaidHealthModel([
      unit("one", [
        event({ timestampMilli: 1_000, eventIndex: 1, kind: "death" }),
        event({ timestampMilli: 3_000, eventIndex: 2, kind: "cast" }),
      ]),
    ]);

    expect(statusRaidHealthAt(model, 2_000)).toEqual({ percent: 0, alive: 0, total: 1 });
    expect(statusRaidHealthAt(model, 3_000)).toEqual({ percent: 100, alive: 1, total: 1 });
  });

  it("shows healing recovery after a raid-wide dip", () => {
    const model = createStatusRaidHealthModel([
      unit("one", [
        event({ timestampMilli: 1_000, eventIndex: 1, kind: "damage", amount: 800 }),
        event({ timestampMilli: 2_000, eventIndex: 2, kind: "heal", amount: 600 }),
      ]),
      unit("two", [
        event({ timestampMilli: 1_000, eventIndex: 3, kind: "damage", amount: 800 }),
        event({ timestampMilli: 2_000, eventIndex: 4, kind: "heal", amount: 600 }),
      ]),
    ]);

    expect(statusRaidHealthAt(model, 2_000).percent).toBeGreaterThan(statusRaidHealthAt(model, 1_000).percent);
  });

  it("captures the lowest estimated health reached inside each timeline bucket", () => {
    const model = createStatusRaidHealthModel([
      unit("one", [
        event({ timestampMilli: 500, eventIndex: 1, kind: "damage", amount: 800 }),
        event({ timestampMilli: 900, eventIndex: 2, kind: "heal", amount: 800 }),
      ]),
    ]);

    const buckets = statusRaidHealthTimeline(model, 0, 2_000, 2);
    expect(buckets).toHaveLength(2);
    expect(buckets[0].percent).toBeLessThan(100);
    expect(buckets[1].percent).toBe(100);
  });
});
