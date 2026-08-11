import { describe, expect, it } from "vitest";
import type { PanelFilter } from "./processors/filters";
import { getTimeRangeDurationMs, type PanelTimeRange } from "./panelDuration";

const fullDurationMs = 60_000;

function controllerRange(overrides: Partial<PanelTimeRange> = {}): PanelTimeRange {
  return {
    enabled: true,
    startOffsetMs: 10_000,
    endOffsetMs: 40_000,
    totalDurationMs: fullDurationMs,
    ...overrides,
  };
}

describe("getTimeRangeDurationMs", () => {
  it("uses the shared selected duration for controller-backed filters", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "controller" }];

    expect(getTimeRangeDurationMs(filters, controllerRange(), fullDurationMs)).toBe(30_000);
  });

  it("uses encounter edges for an open controller bound", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "controller" }];

    expect(getTimeRangeDurationMs(
      filters,
      controllerRange({ startOffsetMs: null, endOffsetMs: 25_000 }),
      fullDurationMs,
    )).toBe(25_000);
    expect(getTimeRangeDurationMs(
      filters,
      controllerRange({ startOffsetMs: 25_000, endOffsetMs: null }),
      fullDurationMs,
    )).toBe(35_000);
  });

  it("ignores a controller filter when no time selection exists", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "controller" }];

    expect(getTimeRangeDurationMs(
      filters,
      controllerRange({ startOffsetMs: null, endOffsetMs: null }),
      fullDurationMs,
    )).toBeNull();
    expect(getTimeRangeDurationMs(
      filters,
      controllerRange({ enabled: false }),
      fullDurationMs,
    )).toBeNull();
  });

  it("uses a directly selected filter duration", () => {
    const filters: PanelFilter[] = [{ type: "time_range", value: "5000,20000" }];

    expect(getTimeRangeDurationMs(filters, controllerRange(), fullDurationMs)).toBe(15_000);
  });

  it("does not change duration without an active positive time range", () => {
    expect(getTimeRangeDurationMs([], controllerRange(), fullDurationMs)).toBeNull();
    expect(getTimeRangeDurationMs(
      [{ type: "time_range", value: "," }],
      controllerRange(),
      fullDurationMs,
    )).toBeNull();
    expect(getTimeRangeDurationMs(
      [{ type: "time_range", value: "5000,20000", negate: true }],
      controllerRange(),
      fullDurationMs,
    )).toBeNull();
  });

  it("clamps the selection and keeps zero-width durations finite", () => {
    expect(getTimeRangeDurationMs(
      [{ type: "time_range", value: "-5000,70000" }],
      controllerRange(),
      fullDurationMs,
    )).toBe(fullDurationMs);
    expect(getTimeRangeDurationMs(
      [{ type: "time_range", value: "20000,20000" }],
      controllerRange(),
      fullDurationMs,
    )).toBe(1);
  });
});
