import { describe, expect, it } from "vitest";
import type { StatusEncounter, StatusTimelineEvent, StatusUnitTimeline } from "./status.processor";
import {
  cachedStatusAmplitudeBaseline,
  statusAmplitudeBaseline,
  statusEventOpacity,
  statusMarkerAmplitude,
} from "./statusAmplitude";

function event(kind: "damage" | "heal" | "absorbed", amount: number): StatusTimelineEvent {
  return {
    timestampMilli: 0,
    offsetMilli: 0,
    eventIndex: 0,
    kind,
    amount,
    spellId: null,
    label: "event",
    sourceId: "source",
    sourceName: "Source",
    targetId: "target",
  };
}

function unit(unitId: string, events: StatusTimelineEvent[]): StatusUnitTimeline {
  return {
    unitId,
    name: unitId,
    className: "WARRIOR",
    kind: "player",
    ownerId: null,
    events,
  };
}

function encounter(units: StatusUnitTimeline[]): StatusEncounter {
  return {
    encounterId: "encounter",
    startMilli: 0,
    endMilli: 10_000,
    units: new Map(units.map((statusUnit) => [statusUnit.unitId, statusUnit])),
  };
}

describe("Status event amplitudes", () => {
  it("uses the median damage and healing amount as the baseline", () => {
    expect(statusAmplitudeBaseline([
      event("damage", 100),
      event("heal", 1_000),
      event("damage", 10_000),
      event("absorbed", 100_000),
    ])).toBe(1_000);
    expect(statusAmplitudeBaseline([
      event("damage", 100),
      event("heal", 300),
    ])).toBe(200);
  });

  it("caches one full-encounter baseline per unit group", () => {
    const player = unit("player", [
      event("damage", 100),
      event("heal", 300),
    ]);
    const selectedEncounter = encounter([player]);

    expect(cachedStatusAmplitudeBaseline(selectedEncounter, "players", [player])).toBe(200);

    player.events.push(event("damage", 10_000));
    expect(cachedStatusAmplitudeBaseline(selectedEncounter, "players", [player])).toBe(200);
    expect(cachedStatusAmplitudeBaseline(selectedEncounter, "pets", [player])).toBe(300);
  });

  it("maps the median to the middle and clamps extreme marker sizes", () => {
    const small = statusMarkerAmplitude("damage", 10, 1_000);
    const middle = statusMarkerAmplitude("damage", 1_000, 1_000);
    const large = statusMarkerAmplitude("damage", 100_000, 1_000);

    expect(middle.intensity).toBe(0.5);
    expect(small.width).toBe(2);
    expect(large.width).toBe(6);
    expect(small.heightScale).toBe(0.55);
    expect(large.heightScale).toBeCloseTo(0.95);
  });

  it("fades past events from the playhead to transparent at the history edge", () => {
    expect(statusEventOpacity(10_000, 10_000, 2_000)).toBe(0.9);
    expect(statusEventOpacity(11_000, 10_000, 2_000)).toBe(0.9);
    expect(statusEventOpacity(9_000, 10_000, 2_000)).toBeGreaterThan(0);
    expect(statusEventOpacity(9_000, 10_000, 2_000)).toBeLessThan(0.9);
    expect(statusEventOpacity(8_000, 10_000, 2_000)).toBe(0);
    expect(statusEventOpacity(7_000, 10_000, 2_000)).toBe(0);
  });

  it("uses matching amplitude with distinct damage and healing hues", () => {
    const damage = statusMarkerAmplitude("damage", 1_000, 1_000);
    const healing = statusMarkerAmplitude("heal", 1_000, 1_000);

    expect(damage.width).toBe(healing.width);
    expect(damage.color).toContain("hsl(0 ");
    expect(healing.color).toContain("hsl(151 ");
  });
});
