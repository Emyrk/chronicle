import { describe, expect, it } from "vitest";
import type { StatusTimelineEvent } from "./status.processor";
import {
  statusWaveformBarHeight,
  statusWaveformBarOpacity,
  statusWaveformEvents,
  statusWaveformPosition,
  statusWaveformScale,
  statusWaveformScaleSummary,
} from "./statusWaveform";

function event(kind: StatusTimelineEvent["kind"], amount: number): StatusTimelineEvent {
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

  it("compresses magnitudes into the three to ten pixel half-height", () => {
    expect(statusWaveformBarHeight(1, 10_000)).toBe(3);
    expect(statusWaveformBarHeight(1_000, 10_000)).toBe(4);
    expect(statusWaveformBarHeight(10_000, 10_000)).toBe(10);
  });

  it("uses only two opacity tiers", () => {
    expect(statusWaveformBarOpacity(84, 85)).toBe(0.72);
    expect(statusWaveformBarOpacity(85, 85)).toBe(0.95);
  });

  it("clamps positions before the left edge and just inside the right edge", () => {
    expect(statusWaveformPosition(-1, 0, 100)).toBe(0);
    expect(statusWaveformPosition(50, 0, 100)).toBe(50);
    expect(statusWaveformPosition(100, 0, 100)).toBe(99.7);
    expect(statusWaveformPosition(200, 0, 100)).toBe(99.7);
  });
});
