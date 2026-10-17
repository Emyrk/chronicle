import { describe, expect, it } from "vitest";
import type { StatusTimelineEvent } from "./status.processor";
import {
  statusWaveformBarHeight,
  statusWaveformBarOpacity,
  statusWaveformBarWidth,
  statusWaveformEvents,
  statusWaveformEventsAround,
  statusWaveformPosition,
  statusWaveformScale,
  statusWaveformTimestampAtPointer,
  statusWaveformScaleSummary,
} from "./statusWaveform";

function event(
  kind: StatusTimelineEvent["kind"],
  amount: number,
  timestampMilli = 0,
  eventIndex = 0,
): StatusTimelineEvent {
  return {
    timestampMilli,
    offsetMilli: timestampMilli,
    eventIndex,
    kind,
    amount,
    spellId: null,
    label: "event",
    sourceId: "source",
    sourceName: "Source",
    targetId: "target",
  };
}

describe("Status signed waveform", () => {
  it("includes only positive health events", () => {
    expect(statusWaveformEvents([
      event("damage", 100),
      event("heal", 200),
      event("absorbed", 300),
      event("death", 400),
      event("damage", 0),
    ]).map(({ kind }) => kind)).toEqual(["damage", "heal", "absorbed"]);
  });

  it("uses the largest row event and top fifteen percent threshold", () => {
    const events = statusWaveformEvents(Array.from({ length: 20 }, (_, index) =>
      event(index % 2 === 0 ? "damage" : "heal", index + 1),
    ));
    expect(statusWaveformScale(events)).toEqual({
      rowMedian: 10.5,
      rowMax: 20,
      highMagnitudeThreshold: 17,
    });
  });

  it("summarizes the per-row maximum scales", () => {
    expect(statusWaveformScaleSummary([0, 100, 1_000, 10_000])).toEqual({
      min: 100,
      median: 1_000,
      max: 10_000,
    });
    expect(statusWaveformScaleSummary([100, 300])).toEqual({
      min: 100,
      median: 200,
      max: 300,
    });
    expect(statusWaveformScaleSummary([0])).toBeNull();
  });

  it("compresses values below the median and emphasizes values near the max", () => {
    expect(statusWaveformBarHeight(1, 1_000, 10_000)).toBe(3);
    expect(statusWaveformBarHeight(500, 1_000, 10_000)).toBe(3);
    expect(statusWaveformBarHeight(1_000, 1_000, 10_000)).toBe(4);
    expect(statusWaveformBarHeight(5_500, 1_000, 10_000)).toBe(6);
    expect(statusWaveformBarHeight(9_000, 1_000, 10_000)).toBe(9);
    expect(statusWaveformBarHeight(10_000, 1_000, 10_000)).toBe(10);
  });

  it("keeps two magnitude tiers and fades past events by age", () => {
    expect(statusWaveformBarOpacity(84, 85, 10_000, 10_000, 2_000)).toBe(0.72);
    expect(statusWaveformBarOpacity(85, 85, 10_000, 10_000, 2_000)).toBe(0.95);
    expect(statusWaveformBarOpacity(85, 85, 9_000, 10_000, 2_000)).toBeCloseTo(0.372, 2);
    expect(statusWaveformBarOpacity(85, 85, 8_000, 10_000, 2_000)).toBe(0);
  });

  it("widens bars only for the tight ten-second window", () => {
    expect(statusWaveformBarWidth(2_000, 8_000)).toBe(3);
    expect(statusWaveformBarWidth(5_000, 20_000)).toBe(2);
    expect(statusWaveformBarWidth(10_000, 40_000)).toBe(2);
  });

  it("clamps positions before the left edge and just inside the right edge", () => {
    expect(statusWaveformPosition(-1, 0, 100)).toBe(0);
    expect(statusWaveformPosition(50, 0, 100)).toBe(50);
    expect(statusWaveformPosition(100, 0, 100)).toBe(99.7);
    expect(statusWaveformPosition(200, 0, 100)).toBe(99.7);
  });

  it("maps pointer position into the timeline window", () => {
    expect(statusWaveformTimestampAtPointer(0, 200, 10_000, 20_000)).toBe(10_000);
    expect(statusWaveformTimestampAtPointer(100, 200, 10_000, 20_000)).toBe(20_000);
    expect(statusWaveformTimestampAtPointer(250, 200, 10_000, 20_000)).toBe(30_000);
  });

  it("selects and orders health events within one second of the hover point", () => {
    const events = statusWaveformEvents([
      event("damage", 300, 8_999, 1),
      event("heal", 500, 9_000, 2),
      event("absorbed", 200, 10_500, 4),
      event("damage", 700, 11_000, 3),
      event("heal", 900, 11_001, 5),
    ]);

    expect(statusWaveformEventsAround(events, 10_000).map((item) => item.eventIndex)).toEqual([2, 4, 3]);
  });
});
