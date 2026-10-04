import { describe, expect, it } from "vitest";
import { buildCooldownIndex, buildCooldownRows, buildSegments, normalizeClassName } from "./cooldownUsage";
import type { CooldownUsageResult } from "./cooldownUsage.processor";

const window = (start: number, end: number, id = "e1") => ({ id, name: id, start, end });

describe("buildSegments", () => {
  it("splits a window into cooldown and ready time", () => {
    const { segments, readyMs } = buildSegments(
      [{ at: 10_000, cooldownMs: 30_000 }, { at: 60_000, cooldownMs: 30_000 }],
      [window(0, 100_000)],
    );
    expect(segments.map((s) => [s.kind, s.start, s.end])).toEqual([
      ["ready", 0, 10_000],
      ["cooldown", 10_000, 40_000],
      ["ready", 40_000, 60_000],
      ["cooldown", 60_000, 90_000],
      ["ready", 90_000, 100_000],
    ]);
    expect(readyMs).toBe(40_000);
  });

  it("carries a cooldown into the next window and ignores time between pulls", () => {
    const { segments, readyMs } = buildSegments(
      [{ at: 90_000, cooldownMs: 60_000 }],
      [window(0, 100_000, "a"), window(130_000, 200_000, "b")],
    );
    expect(segments.map((s) => [s.kind, s.start, s.end])).toEqual([
      ["ready", 0, 90_000],
      ["cooldown", 90_000, 100_000],
      ["cooldown", 130_000, 150_000],
      ["ready", 150_000, 200_000],
    ]);
    expect(readyMs).toBe(140_000);
  });

  it("is entirely ready when never cast", () => {
    expect(buildSegments([], [window(0, 50_000)]).readyMs).toBe(50_000);
  });
});

describe("buildCooldownRows", () => {
  it("folds ranks, adds classmates who never cast it, and drops short cooldowns", () => {
    const index = buildCooldownIndex({
      Druid: [
        { id: 29166, name: "Innervate", name_subtext: "", cooldown_ms: 360_000, recovery_time_ms: 360_000, category_recovery_time_ms: 0, ignored: false },
        { id: 22812, name: "Barkskin", name_subtext: "", cooldown_ms: 60_000, recovery_time_ms: 60_000, category_recovery_time_ms: 0, ignored: false },
        { id: 16979, name: "Feral Charge", name_subtext: "", cooldown_ms: 15_000, recovery_time_ms: 15_000, category_recovery_time_ms: 0, ignored: false },
      ],
    });
    const result: CooldownUsageResult = {
      Casters: new Map([
        ["p1", { playerID: "p1", playerName: "Sylas", className: "DRUID", casts: new Map([[29166, [5_000]], [16979, [1_000]]]) }],
        ["p2", { playerID: "p2", playerName: "Oakhart", className: "DRUID", casts: new Map([[5176, [2_000]]]) }],
      ]),
    };

    const rows = buildCooldownRows(result, index, [window(0, 400_000)], 30_000);
    expect(rows.map((r) => [r.cooldown.name, r.playerName, r.casts.length])).toEqual([
      ["Innervate", "Oakhart", 0],
      ["Innervate", "Sylas", 1],
    ]);
  });
});

describe("buildCooldownRows across the whole log", () => {
  const index = buildCooldownIndex({
    Druid: [{ id: 29166, name: "Innervate", name_subtext: "", cooldown_ms: 360_000, recovery_time_ms: 360_000, category_recovery_time_ms: 0, ignored: false }],
  });

  it("carries a cooldown used before the selected fight without counting the cast", () => {
    const result: CooldownUsageResult = {
      Casters: new Map([
        ["p1", { playerID: "p1", playerName: "Sylas", className: "DRUID", casts: new Map([[29166, [100_000]], [5176, [400_000]]]) }],
      ]),
    };
    const [row] = buildCooldownRows(result, index, [window(300_000, 600_000)], 30_000);
    expect(row.casts).toEqual([]);
    expect(row.segments.map((s) => [s.kind, s.start, s.end, s.castAt])).toEqual([
      ["cooldown", 300_000, 460_000, 100_000],
      ["ready", 460_000, 600_000, undefined],
    ]);
  });

  it("skips players who did nothing in the selected fights", () => {
    const result: CooldownUsageResult = {
      Casters: new Map([
        ["p1", { playerID: "p1", playerName: "Sylas", className: "DRUID", casts: new Map([[29166, [350_000]]]) }],
        ["p2", { playerID: "p2", playerName: "Benched", className: "DRUID", casts: new Map([[29166, [10_000]]]) }],
      ]),
    };
    const rows = buildCooldownRows(result, index, [window(300_000, 600_000)], 30_000);
    expect(rows.map((r) => r.playerName)).toEqual(["Sylas"]);
  });
});

describe("ignored cooldowns", () => {
  it("are left out of the panel", () => {
    const index = buildCooldownIndex({
      Druid: [
        { id: 29166, name: "Innervate", name_subtext: "", cooldown_ms: 360_000, recovery_time_ms: 360_000, category_recovery_time_ms: 0, ignored: false },
        { id: 22812, name: "Barkskin", name_subtext: "", cooldown_ms: 60_000, recovery_time_ms: 60_000, category_recovery_time_ms: 0, ignored: true },
      ],
    });
    const result: CooldownUsageResult = {
      Casters: new Map([
        ["p1", { playerID: "p1", playerName: "Sylas", className: "DRUID", casts: new Map([[29166, [5_000]], [22812, [6_000]]]) }],
      ]),
    };
    const rows = buildCooldownRows(result, index, [window(0, 400_000)], 30_000);
    expect(rows.map((r) => r.cooldown.name)).toEqual(["Innervate"]);
  });
});

describe("normalizeClassName", () => {
  it("matches API and player class spellings", () => {
    expect(normalizeClassName("DeathKnight")).toBe("DEATHKNIGHT");
    expect(normalizeClassName("DRUID")).toBe("DRUID");
  });
});
