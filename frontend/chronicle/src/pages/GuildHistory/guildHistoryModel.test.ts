import { describe, expect, it } from "vitest";
import type { GuildSpeedrunRun } from "@/api/typesGenerated";
import {
  clearConsistencyLabel,
  filterGuildRuns,
  formatClearTime,
  GUILD_HISTORY_MAX_TIME_MS,
  guildHistoryValueIsShown,
  mergeBossOrder,
  summarizeBossSplits,
  summarizeClearTimes,
} from "./guildHistoryModel";
import { parseGuildHistoryState, serializeGuildHistoryState, DEFAULT_GUILD_HISTORY_STATE } from "./guildHistoryState";

const MINUTE = 60_000;
const START = Date.parse("2026-09-01T19:00:00Z");

function run(day: number, minutes: number, overrides: Partial<GuildSpeedrunRun> = {}): GuildSpeedrunRun {
  const start = START + day * 24 * 60 * MINUTE;
  return {
    slug: `run-${day}`,
    qualified: true,
    player_count: 25,
    start_time: new Date(start).toISOString(),
    completion_time: new Date(start + minutes * MINUTE).toISOString(),
    duration_ms: minutes * MINUTE,
    boss_to_boss_duration_ms: (minutes - 3) * MINUTE,
    trash_duration_ms: 0,
    clear_parse: null,
    bosses: [],
    ...overrides,
  };
}

describe("summarizeClearTimes", () => {
  it("treats the fastest clear as best and slower clears as worse", () => {
    const summary = summarizeClearTimes([run(0, 70), run(7, 60), run(14, 65), run(21, 62)], "full")!;
    expect(summary.best).toBe(60 * MINUTE);
    expect(summary.typical).toBe(63.5 * MINUTE);
    expect(summary.trend!.slope).toBeLessThan(0);
  });

  it("uses boss-to-boss timing when asked", () => {
    expect(summarizeClearTimes([run(0, 70)], "boss")!.best).toBe(67 * MINUTE);
  });

  it("charts a focused boss's fight length and skips clears without that kill", () => {
    const kill = (name: string, seconds: number) => ({ encounter_name: name, killed_at: new Date(START).toISOString(), duration_ms: seconds * 1000, parse: null });
    const runs = [
      run(0, 70, { bosses: [kill("Lucifron", 90)] }),
      run(7, 65, { bosses: [kill("Lucifron", 60)] }),
      run(14, 60, { bosses: [kill("Magmadar", 50)] }),
    ];
    const summary = summarizeClearTimes(runs, "full", { boss: "Lucifron", part: "" })!;
    expect(summary.runCount).toBe(2);
    expect(summary.best).toBe(60_000);
  });

  it("charts one part of each clear", () => {
    const kill = { encounter_name: "Lucifron", killed_at: new Date(START).toISOString(), duration_ms: 5 * MINUTE, parse: null };
    const runs = [run(0, 60, { trash_duration_ms: 20 * MINUTE, bosses: [kill] })];
    expect(summarizeClearTimes(runs, "full", { boss: "", part: "trash" })!.typical).toBe(20 * MINUTE);
    expect(summarizeClearTimes(runs, "full", { boss: "", part: "idle" })!.typical).toBe(35 * MINUTE);
    expect(summarizeClearTimes(runs, "full", { boss: "", part: "boss" })!.typical).toBe(5 * MINUTE);
  });

  it("summarizes parses with higher as better and skips clears without one", () => {
    const runs = [
      run(0, 70, { clear_parse: 40 }),
      run(7, 65, { clear_parse: 60 }),
      run(14, 60, { clear_parse: 80 }),
      run(21, 62, { clear_parse: null }),
    ];
    const summary = summarizeClearTimes(runs, "full", { boss: "", part: "" }, "parse")!;
    expect(summary.parse).toBe(true);
    expect(summary.runCount).toBe(3);
    expect(summary.best).toBe(80);
    expect(summary.worst).toBe(44);
    expect(summary.trend!.slope).toBeGreaterThan(0);
    // Boss-to-boss timing and clear parts have no parses.
    expect(summarizeClearTimes(runs, "boss", { boss: "", part: "" }, "parse")).toBeNull();
    expect(summarizeClearTimes(runs, "full", { boss: "", part: "idle" }, "parse")).toBeNull();
  });

  it("only flags clears well away from the pack as outliers", () => {
    const runs = [60, 61, 62, 63, 64, 66, 140].map((minutes, index) => run(index * 7, minutes));
    expect(summarizeClearTimes(runs, "full")!.outliers).toEqual([140 * MINUTE]);
    expect(summarizeClearTimes(runs.slice(0, 6), "full")!.outliers).toEqual([]);
  });

  it("excludes clear times over six hours from history statistics", () => {
    const runs = [run(0, 60), run(7, 65), run(14, 7 * 60)];
    const summary = summarizeClearTimes(runs, "full")!;
    expect(summary.runCount).toBe(2);
    expect(summary.typical).toBe(62.5 * MINUTE);
    expect(guildHistoryValueIsShown(GUILD_HISTORY_MAX_TIME_MS, "time")).toBe(true);
    expect(guildHistoryValueIsShown(GUILD_HISTORY_MAX_TIME_MS + 1, "time")).toBe(false);
    expect(guildHistoryValueIsShown(GUILD_HISTORY_MAX_TIME_MS + 1, "parse")).toBe(true);
  });

  it("reports Recent only once there are more clears than the recent window", () => {
    expect(summarizeClearTimes([1, 2, 3, 4, 5].map((day) => run(day * 7, 60)), "full")!.recent).toBeNull();
    expect(summarizeClearTimes([1, 2, 3, 4, 5, 6].map((day) => run(day * 7, 60)), "full")!.recent).toBe(60 * MINUTE);
  });
});

describe("filterGuildRuns", () => {
  it("drops unqualified clears unless asked, and clears outside the range", () => {
    const runs = [run(0, 60), run(50, 60), run(55, 60, { qualified: false })];
    const now = START + 60 * 24 * 60 * MINUTE;
    expect(filterGuildRuns(runs, { includeUnqualified: false, rangeDays: 30, now }).map((item) => item.slug)).toEqual(["run-50"]);
    expect(filterGuildRuns(runs, { includeUnqualified: true, rangeDays: 30, now })).toHaveLength(2);
  });
});

describe("summarizeBossSplits", () => {
  it("splits each clear into boss, trash and idle time", () => {
    const kill = (name: string, minute: number, seconds: number) => ({
      encounter_name: name,
      killed_at: new Date(START + minute * MINUTE).toISOString(),
      duration_ms: seconds * 1000,
      parse: null,
    });
    const summary = summarizeBossSplits([
      run(0, 30, { trash_duration_ms: 10 * MINUTE, bosses: [kill("Lucifron", 5, 60), kill("Magmadar", 12, 120)] }),
    ])!;
    expect(summary.bosses.map((boss) => boss.name)).toEqual(["Lucifron", "Magmadar"]);
    expect(summary.bosses[1].typicalSplitMs).toBe(12 * MINUTE);
    expect(summary.typicalBossMs).toBe(3 * MINUTE);
    expect(summary.typicalTrashMs).toBe(10 * MINUTE);
    expect(summary.typicalIdleMs).toBe(17 * MINUTE);
  });

  it("merges boss order across guilds that route differently", () => {
    const summary = (names: string[]) => ({
      bosses: names.map((name, order) => ({
        name,
        order,
        kills: 1,
        typicalMs: 0,
        bestMs: 0,
        typicalSplitMs: 0,
        durations: [0],
        median: 0,
        lowerQuartile: 0,
        upperQuartile: 0,
        lowWhisker: 0,
        highWhisker: 0,
        outliers: [],
      })),
      typicalBossMs: 0,
      typicalTrashMs: 0,
      typicalIdleMs: 0,
      typicalClearMs: 0,
    });
    expect(mergeBossOrder([summary(["A", "B", "C"]), summary(["A", "C", "B"]), null])).toEqual(["A", "B", "C"]);
  });
});

describe("formatting", () => {
  it("formats clear times and labels consistency", () => {
    expect(formatClearTime(65 * MINUTE + 4000)).toBe("1:05:04");
    expect(formatClearTime(-90_000)).toBe("−1:30");
    expect(clearConsistencyLabel(4 * MINUTE, 60 * MINUTE)).toBe("High");
    expect(clearConsistencyLabel(15 * MINUTE, 60 * MINUTE)).toBe("Low");
  });
});

describe("guild history URL state", () => {
  it("round-trips and leaves defaults out", () => {
    expect(serializeGuildHistoryState(DEFAULT_GUILD_HISTORY_STATE).toString()).toBe("");
    const state = { ...DEFAULT_GUILD_HISTORY_STATE, guildIds: ["a", "b"], hiddenGuildIds: ["b"], instanceName: "Molten Core", timing: "boss" as const, display: "parse" as const, boss: "Ragnaros", part: "" as const, tab: "runs" as const };
    expect(parseGuildHistoryState(serializeGuildHistoryState(state))).toEqual(state);
  });
});
