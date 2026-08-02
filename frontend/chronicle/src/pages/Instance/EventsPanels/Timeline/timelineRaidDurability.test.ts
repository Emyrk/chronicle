import { describe, expect, it } from "vitest";
import type { StatusTimelineEvent, StatusUnitTimeline } from "../Status/status.processor";
import { createStatusRaidHealthModel } from "../Status/statusRaidHealth";
import {
  createTimelineRaidDurabilityBars,
  timelineRaidDurabilityColor,
} from "./timelineRaidDurability";

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
    targetId: "player",
    ...overrides,
  };
}

function player(events: StatusTimelineEvent[]): StatusUnitTimeline {
  return {
    unitId: "player",
    name: "Player",
    className: "WARRIOR",
    kind: "player",
    ownerId: null,
    events,
  };
}

describe("timeline raid durability background", () => {
  it("aligns durability buckets to the chart duration", () => {
    const model = createStatusRaidHealthModel([
      player([
        event({ timestampMilli: 1_500, eventIndex: 1, amount: 800 }),
        event({ timestampMilli: 1_900, eventIndex: 2, kind: "heal", amount: 800 }),
      ]),
    ]);

    const bars = createTimelineRaidDurabilityBars(model, 1_000, 2_000, 2);

    expect(bars).toHaveLength(2);
    expect(bars[0]).toMatchObject({ startSec: 0, endSec: 1 });
    expect(bars[0].percent).toBeLessThan(100);
    expect(bars[1]).toMatchObject({ startSec: 1, endSec: 2, percent: 100 });
  });

  it("uses the same green, amber, and red durability thresholds as the strip", () => {
    expect(timelineRaidDurabilityColor(55)).toBe("#10b981");
    expect(timelineRaidDurabilityColor(54)).toBe("#f59e0b");
    expect(timelineRaidDurabilityColor(24)).toBe("#ef4444");
  });
});
