import { describe, expect, it } from "vitest";
import type { VehicleControlInterval } from "@/api/typesGenerated";
import type { Encounter } from "../../InstancePage";
import {
  buildTimelineTicks,
  clipIntervalToRange,
  formatTimelineElapsed,
  formatVehicleDuration,
  intervalOverlapsRange,
  selectedEncounterRange,
} from "./vehiclePanelLogic";

const encounter = (
  id: string,
  start: string,
  end: string,
): Encounter => ({
  id,
  name: id,
  boss: false,
  kill_type: "clean",
  start_time: start,
  end_time: end,
});

const interval = (
  assignedAtMs: number,
  releasedAtMs?: number,
): VehicleControlInterval => ({
  vehicle_guid: "0xF15000812400008F",
  controller_guid: "0x000000000000000B",
  assigned_at_ms: assignedAtMs,
  released_at_ms: releasedAtMs,
  assigned_ordinal: 1,
});

describe("vehiclePanelLogic", () => {
  it("builds a range spanning selected encounters", () => {
    const encounters = [
      encounter("first", "2026-08-09T02:41:00.000Z", "2026-08-09T02:41:10.000Z"),
      encounter("middle", "2026-08-09T02:42:00.000Z", "2026-08-09T02:42:10.000Z"),
      encounter("last", "2026-08-09T02:43:00.000Z", "2026-08-09T02:43:20.000Z"),
    ];

    expect(selectedEncounterRange(encounters, ["first", "last"])).toEqual({
      startMs: Date.parse("2026-08-09T02:41:00.000Z"),
      endMs: Date.parse("2026-08-09T02:43:20.000Z"),
    });
  });

  it("uses half-open interval overlap at release boundaries", () => {
    const range = { startMs: 2000, endMs: 4000 };

    expect(intervalOverlapsRange(interval(1000, 2000), range)).toBe(false);
    expect(intervalOverlapsRange(interval(1000, 2001), range)).toBe(true);
    expect(intervalOverlapsRange(interval(4000, 5000), range)).toBe(true);
    expect(intervalOverlapsRange(interval(4001, 5000), range)).toBe(false);
  });

  it("clips pre-instance and open assignments to the selected range", () => {
    const range = { startMs: 2000, endMs: 4000 };

    expect(clipIntervalToRange(interval(1000, 3000), range)).toEqual({
      startMs: 2000,
      endMs: 3000,
    });
    expect(clipIntervalToRange(interval(3000), range)).toEqual({
      startMs: 3000,
      endMs: 4000,
    });
  });

  it("formats short and long durations", () => {
    expect(formatVehicleDuration(341)).toBe("341ms");
    expect(formatVehicleDuration(12_900)).toBe("12s");
    expect(formatVehicleDuration(72_000)).toBe("1m 12s");
  });

  it("builds readable elapsed-time ticks including the exact selected duration", () => {
    const ticks = buildTimelineTicks(45_000);
    expect(ticks.map(({ elapsedMs, label }) => ({ elapsedMs, label }))).toEqual([
      { elapsedMs: 0, label: "0s" },
      { elapsedMs: 10_000, label: "10s" },
      { elapsedMs: 20_000, label: "20s" },
      { elapsedMs: 30_000, label: "30s" },
      { elapsedMs: 40_000, label: "40s" },
      { elapsedMs: 45_000, label: "45s" },
    ]);
    expect(ticks[3].positionPercent).toBeCloseTo(66.6667, 3);
    expect(ticks.at(-1)?.positionPercent).toBe(100);
  });

  it("formats subsecond and multi-minute axis labels", () => {
    expect(formatTimelineElapsed(0)).toBe("0s");
    expect(formatTimelineElapsed(500)).toBe("500ms");
    expect(formatTimelineElapsed(1_500)).toBe("1.5s");
    expect(formatTimelineElapsed(120_000)).toBe("2m");
    expect(formatTimelineElapsed(132_000)).toBe("2m 12s");
  });
});
