import { describe, expect, it } from "vitest";
import {
  buildHistogram,
  formatClock,
  niceStep,
  outlierZoomRange,
  parseTierIndex,
  summarizeCohort,
  tierCutoffs,
} from "./cohortStats";

describe("parseTierIndex", () => {
  it("maps scores to tier floors", () => {
    expect(parseTierIndex(100)).toBe(0);
    expect(parseTierIndex(99)).toBe(1);
    expect(parseTierIndex(97)).toBe(2);
    expect(parseTierIndex(75)).toBe(3);
    expect(parseTierIndex(74)).toBe(4);
    expect(parseTierIndex(25)).toBe(5);
    expect(parseTierIndex(0)).toBe(6);
  });
});

describe("tierCutoffs", () => {
  const values = [
    { value: 60_000, score: 100 },
    { value: 70_000, score: 80 },
    { value: 80_000, score: 60 },
    { value: 90_000, score: 40 },
    { value: 100_000, score: 20 },
  ];

  it("returns the slowest qualifying time for lower-is-better cohorts", () => {
    expect(tierCutoffs(values, "lower", [95, 75, 50, 25])).toEqual([
      { floor: 95, value: 60_000 },
      { floor: 75, value: 70_000 },
      { floor: 50, value: 80_000 },
      { floor: 25, value: 90_000 },
    ]);
  });

  it("returns the lowest qualifying value for higher-is-better cohorts", () => {
    const dps = [
      { value: 900, score: 100 },
      { value: 800, score: 75 },
      { value: 500, score: 20 },
    ];
    expect(tierCutoffs(dps, "higher", [99, 75, 25])).toEqual([
      { floor: 99, value: 900 },
      { floor: 75, value: 800 },
      { floor: 25, value: 800 },
    ]);
  });

  it("returns null when no value reaches a tier", () => {
    expect(tierCutoffs([{ value: 1, score: 10 }], "lower", [50])).toEqual([{ floor: 50, value: null }]);
  });
});

describe("summarizeCohort", () => {
  it("orients best and worst by direction", () => {
    expect(summarizeCohort([3, 1, 4, 2], "lower")).toEqual({ count: 4, best: 1, median: 2.5, worst: 4 });
    expect(summarizeCohort([3, 1, 2], "higher")).toEqual({ count: 3, best: 3, median: 2, worst: 1 });
    expect(summarizeCohort([], "lower")).toBeNull();
  });
});

describe("niceStep", () => {
  it("snaps durations to clock-friendly steps", () => {
    expect(niceStep(7_000, true)).toBe(10_000);
    expect(niceStep(40_000, true)).toBe(60_000);
  });

  it("snaps metrics to 1/2/5 steps", () => {
    expect(niceStep(13, false)).toBe(20);
    expect(niceStep(0.3, false)).toBeCloseTo(0.5);
    expect(niceStep(700, false)).toBe(1000);
  });
});

describe("buildHistogram", () => {
  it("bins on nice boundaries and counts tiers per bin", () => {
    const bins = buildHistogram(
      [
        { value: 61_000, score: 100 },
        { value: 64_000, score: 80 },
        { value: 79_000, score: 30 },
        { value: 80_000, score: 10 },
      ],
      { targetBins: 2, time: true },
    );
    expect(bins.map((bin) => [bin.start, bin.end, bin.total])).toEqual([
      [60_000, 70_000, 2],
      [70_000, 80_000, 1],
      [80_000, 90_000, 1],
    ]);
    expect(bins[0].tierCounts[0]).toBe(1);
    expect(bins[0].tierCounts[3]).toBe(1);
    expect(bins.reduce((sum, bin) => sum + bin.total, 0)).toBe(4);
  });

  it("handles a cohort where every value is equal", () => {
    const bins = buildHistogram([{ value: 5_000, score: 100 }, { value: 5_000, score: 100 }], { time: true });
    expect(bins).toHaveLength(1);
    expect(bins[0].total).toBe(2);
  });
});

describe("formatClock", () => {
  it("formats minutes and hours", () => {
    expect(formatClock(95_000)).toBe("1:35");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});

describe("outlierZoomRange", () => {
  const bulk = Array.from({ length: 100 }, (_, i) => 3600 + i * 30);

  it("zooms past a few extreme values", () => {
    const range = outlierZoomRange([...bulk, 600_000, 700_000]);
    expect(range).not.toBeNull();
    expect(range!.lo).toBe(3600);
    expect(range!.hi).toBeLessThan(20_000);
  });

  it("leaves ordinary spreads alone", () => {
    expect(outlierZoomRange(bulk)).toBeNull();
    expect(outlierZoomRange([...bulk, 9_000])).toBeNull();
    expect(outlierZoomRange([1, 2, 1000])).toBeNull();
  });
});
