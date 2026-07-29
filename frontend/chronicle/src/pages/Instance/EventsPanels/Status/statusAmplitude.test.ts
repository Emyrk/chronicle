import { describe, expect, it } from "vitest";
import type { StatusTimelineEvent } from "./status.processor";
import { statusAmplitudeBaseline, statusEventOpacity, statusMarkerAmplitude } from "./statusAmplitude";

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

describe("Status event amplitudes", () => {
  it("uses the median visible damage and healing amount as the baseline", () => {
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
