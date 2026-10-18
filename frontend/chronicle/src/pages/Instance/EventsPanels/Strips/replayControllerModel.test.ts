import { describe, expect, it } from "vitest";
import { timelineProcessor } from "../Timeline/timeline.processor";
import { PARTY_DAMAGE_SERIES_ID, type ReplayControllerResult } from "./replayController.processor";
import { formatBucket, formatReplayClock, replayBucketMs, replayControllerMarkers, replayControllerTicks, replayDamageBars, replayDurabilityBars } from "./replayControllerModel";

const START = 1_000_000;

function result(overrides: Partial<ReplayControllerResult> = {}): ReplayControllerResult {
  return { timeline: timelineProcessor.createState(), baseMs: START, ...overrides };
}

// Party damage in 2s bins from START.
function damage(bins: number[], binMs = 2000): ReplayControllerResult {
  const data = result();
  data.timeline.binMs = binMs;
  data.timeline.series.set(PARTY_DAMAGE_SERIES_ID, bins);
  return data;
}

describe("replayDamageBars", () => {
  const bounds = { startMs: START, endMs: START + 6000 };

  it("fills played bars, partly fills the current one and ghosts the rest", () => {
    const bars = replayDamageBars(damage([100, 200, 50]), bounds, START + 3000, 2000);
    expect(bars.map((bar) => bar.state)).toEqual(["past", "current", "future"]);
    expect(bars.map((bar) => bar.height)).toEqual([50, 100, 25]);
    expect(bars.map((bar) => bar.fill)).toEqual([50, 50, 0]);
  });

  it("shows every bar as played with replay off", () => {
    expect(replayDamageBars(damage([100, 200, 50]), bounds, null, 2000).every((bar) => bar.state === "past")).toBe(true);
  });

  it("sums fine bins into each bar and lines them up with later bounds", () => {
    expect(replayDamageBars(damage([10, 30, 20, 40], 500), { startMs: START, endMs: START + 2000 }, null, 1000).map((bar) => bar.value)).toEqual([40, 60]);
    expect(replayDamageBars(damage([1, 2, 3, 4]), { startMs: START + 4000, endMs: START + 8000 }, null, 2000).map((bar) => bar.value)).toEqual([3, 4]);
  });
});

describe("replayDurabilityBars", () => {
  const bounds = { startMs: START, endMs: START + 6000 };
  // 100% for the first 2s, 40% until 4s, then 80%.
  const durabilityAt = (ms: number) => ms < START + 2000 ? 100 : ms < START + 4000 ? 40 : 80;

  it("shows each bar's lowest durability, played up to the cursor", () => {
    const bars = replayDurabilityBars(durabilityAt, bounds, START + 3000, 2000);
    expect(bars.map((bar) => bar.state)).toEqual(["past", "current", "future"]);
    // A bar's last sample touches the next level, so each takes the lower of the two.
    expect(bars.map((bar) => bar.value)).toEqual([40, 40, 80]);
    expect(bars[0].fill).toBe(40);
    expect(bars[1].fill).toBe(40);
    expect(bars[2].fill).toBe(0);
  });

  it("shows every bar as played with replay off", () => {
    expect(replayDurabilityBars(durabilityAt, bounds, null, 2000).every((bar) => bar.state === "past")).toBe(true);
  });

  it("leaves bars outside every encounter empty", () => {
    const bars = replayDurabilityBars((ms) => ms < START + 2000 ? 90 : null, bounds, null, 2000);
    expect(bars.map((bar) => bar.value)).toEqual([90, 0, 0]);
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
});

describe("replayControllerMarkers", () => {
  it("places player deaths, dimming those after the cursor", () => {
    const data = result();
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
