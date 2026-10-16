import { describe, expect, it } from "vitest";
import { timelineProcessor } from "../Timeline/timeline.processor";
import { PARTY_DAMAGE_SERIES_ID, type ReplayControllerResult } from "./replayController.processor";
import { formatBucket, formatReplayClock, replayBucketMs, replayControllerBars, replayControllerMarkers, replayControllerTicks } from "./replayControllerModel";

const START = 1_000_000;

function result(bins: number[], overrides: Partial<ReplayControllerResult> = {}): ReplayControllerResult {
  const timeline = timelineProcessor.createState();
  timeline.binMs = 2000;
  timeline.series.set(PARTY_DAMAGE_SERIES_ID, bins);
  return { timeline, baseMs: START, ...overrides };
}

describe("replayControllerBars", () => {
  const bounds = { startMs: START, endMs: START + 6000 };

  it("fills played bars, partly fills the current one and ghosts the rest", () => {
    const bars = replayControllerBars(result([100, 200, 50]), bounds, START + 3000, 2000);
    expect(bars.map((bar) => bar.state)).toEqual(["past", "current", "future"]);
    expect(bars.map((bar) => bar.height)).toEqual([50, 100, 25]);
    expect(bars[0].fill).toBe(50);
    expect(bars[1].fill).toBe(50);
    expect(bars[2].fill).toBe(0);
  });

  it("shows every bar as played with replay off", () => {
    expect(replayControllerBars(result([100, 200, 50]), bounds, null, 2000).every((bar) => bar.state === "past")).toBe(true);
  });

  it("lines bins up with bounds that start after the first selected encounter", () => {
    const bars = replayControllerBars(result([1, 2, 3, 4]), { startMs: START + 4000, endMs: START + 8000 }, null, 2000);
    expect(bars.map((bar) => bar.value)).toEqual([3, 4]);
  });
});

describe("bar width", () => {
  it("scales the bar width with the fight length", () => {
    expect(replayBucketMs(43_000)).toBe(500);
    expect(replayBucketMs(80_000)).toBe(1000);
    expect(replayBucketMs(6 * 60_000)).toBe(5000);
    expect(replayBucketMs(37 * 60_000)).toBe(30_000);
    expect(formatBucket(500)).toBe("500ms");
    expect(formatBucket(2000)).toBe("2s");
    expect(formatBucket(60_000)).toBe("1m");
  });

  it("sums fine bins into each bar and fills the current bar by damage done so far", () => {
    const data = result([10, 30, 20, 40]);
    data.timeline.binMs = 500;
    const bars = replayControllerBars(data, { startMs: START, endMs: START + 2000 }, START + 1250, 1000);
    expect(bars.map((bar) => bar.value)).toEqual([40, 60]);
    expect(bars[1].state).toBe("current");
    // Half of the 20 bin before the cursor: 10 of the tallest bar's 60.
    expect(bars[1].fill).toBeCloseTo((10 / 60) * 100);
  });
});

describe("replayControllerMarkers", () => {
  it("places player deaths, dimming those after the cursor", () => {
    const data = result([]);
    data.timeline.playerDeaths.push(
      { offsetMs: 1000, playerId: "a", playerName: "Ladiess", className: "SHAMAN" },
      { offsetMs: 3000, playerId: "p", playerName: "Thaddeus", className: "PALADIN" },
      { offsetMs: 9000, playerId: "x", playerName: "Later", className: "MAGE" },
    );
    expect(replayControllerMarkers(data, { startMs: START, endMs: START + 4000 }, START + 2000)).toEqual([
      { kind: "death", left: 25, title: "0:01 Ladiess died", past: true },
      { kind: "death", left: 75, title: "0:03 Thaddeus died", past: false },
    ]);
  });
});

describe("replayControllerTicks", () => {
  it("labels each minute of a short fight", () => {
    expect(replayControllerTicks({ startMs: 0, endMs: 180_000 }).map((tick) => tick.label)).toEqual(["0:00", "0:30", "1:00", "1:30", "2:00", "2:30", "3:00"]);
  });

  it("keeps at most eight ticks on long runs", () => {
    expect(replayControllerTicks({ startMs: 0, endMs: 3_600_000 }).length).toBeLessThanOrEqual(8);
  });
});

describe("formatReplayClock", () => {
  it("formats minutes and seconds", () => {
    expect(formatReplayClock(93_400)).toBe("1:33");
    expect(formatReplayClock(-5)).toBe("0:00");
  });
});
