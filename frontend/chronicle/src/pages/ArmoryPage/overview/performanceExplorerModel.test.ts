import { describe, expect, it } from "vitest";
import type { CharacterEncounterStats, CharacterPerformanceRun } from "@/api/typesGenerated";
import {
  buildPerformanceVariants,
  calculatePerformanceWaterlines,
  filterPerformanceRuns,
  filterPerformanceRunsByDate,
  filterPerformanceRunSeries,
  performanceValue,
} from "./performanceExplorerModel";

function encounter(overrides: Partial<CharacterEncounterStats> = {}): CharacterEncounterStats {
  return {
    instance_name: "Molten Core",
    encounter_name: "Garr",
    difficulty_name: "Normal",
    max_players: 40,
    kills: 1,
    first_killed_at: "2026-01-01T00:00:00Z",
    last_killed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function run(overrides: Partial<CharacterPerformanceRun> = {}): CharacterPerformanceRun {
  return {
    run_id: "run-1",
    representative_instance_id: "instance-1",
    started_at: "2026-01-01T00:00:00Z",
    killed_at: "2026-01-01T01:00:00Z",
    player_name: "Tester",
    player_class: "PRIEST",
    player_spec: "Shadow",
    player_sub_spec: "Deep Shadow",
    encounter_count: 2,
    damage_done: 2000,
    healing_done: 500,
    absorbed_done: 100,
    duration_secs: 10,
    dps: 200,
    hps: 60,
    log_hashed_slug: "slug",
    average_parse: 87.5,
    ...overrides,
  };
}

describe("buildPerformanceVariants", () => {
  it("groups instance variants and excludes trash", () => {
    const result = buildPerformanceVariants([
      encounter(),
      encounter({ encounter_name: "Magmadar", last_killed_at: "2026-01-02T00:00:00Z" }),
      encounter({ encounter_name: "Trash" }),
      encounter({ instance_name: "Blackwing Lair", encounter_name: "Razorgore", last_killed_at: "2026-02-01T00:00:00Z" }),
    ]);

    expect(result).toHaveLength(2);
    expect(result[0].instanceName).toBe("Blackwing Lair");
    expect(result[1].encounters).toEqual(["Garr", "Magmadar"]);
  });
});

describe("filterPerformanceRuns", () => {
  it("keeps mixed runs by default and filters exact specs", () => {
    const runs = [run(), run({ run_id: "run-2", player_spec: "Mixed", player_sub_spec: "Mixed" })];
    expect(filterPerformanceRuns(runs, null, null, "raw")).toHaveLength(2);
    expect(filterPerformanceRuns(runs, "Shadow", null, "raw")).toEqual([runs[0]]);
  });

  it("omits runs without a complete cached parse in parse mode", () => {
    const runs = [run(), run({ run_id: "run-2", average_parse: undefined })];
    expect(filterPerformanceRuns(runs, null, null, "parse")).toEqual([runs[0]]);
  });
});

describe("filterPerformanceRunsByDate", () => {
  const now = new Date("2026-09-20T12:00:00Z");
  const runs = [
    run({ run_id: "recent", started_at: "2026-09-10T12:00:00Z" }),
    run({ run_id: "within-60", started_at: "2026-08-01T12:00:00Z" }),
    run({ run_id: "within-180", started_at: "2026-06-01T12:00:00Z" }),
    run({ run_id: "older-than-180", started_at: "2026-03-01T12:00:00Z" }),
  ];

  it("supports 180-day, 60-day, and 30-day windows", () => {
    expect(filterPerformanceRunsByDate(runs, "180d", now).map((item) => item.run_id)).toEqual([
      "recent",
      "within-60",
      "within-180",
    ]);
    expect(filterPerformanceRunsByDate(runs, "60d", now).map((item) => item.run_id)).toEqual(["recent", "within-60"]);
    expect(filterPerformanceRunsByDate(runs, "30d", now).map((item) => item.run_id)).toEqual(["recent"]);
  });
});

describe("filterPerformanceRunSeries", () => {
  const now = new Date("2026-09-20T12:00:00Z");

  it("applies independent spec and subspec filters for each player", () => {
    const shadow = run({ run_id: "shadow", player_spec: "Shadow", player_sub_spec: "Deep Shadow", started_at: "2026-09-10T12:00:00Z" });
    const discipline = run({ run_id: "discipline", player_spec: "Discipline", player_sub_spec: "Power Infusion", started_at: "2026-09-11T12:00:00Z" });
    const fire = run({ run_id: "fire", player_spec: "Fire", player_sub_spec: "Deep Fire", started_at: "2026-09-12T12:00:00Z" });

    const result = filterPerformanceRunSeries([
      { id: "priest", runs: [shadow, discipline], spec: "Shadow", subSpec: "Deep Shadow" },
      { id: "mage", runs: [fire], spec: null, subSpec: null },
    ], "raw", "180d", now);

    expect(result[0].runs.map((item) => item.run_id)).toEqual(["shadow"]);
    expect(result[1].runs.map((item) => item.run_id)).toEqual(["fire"]);
  });

  it("tracks raw runs separately when parse mode omits an unscored player run", () => {
    const scored = run({ run_id: "scored", started_at: "2026-09-10T12:00:00Z" });
    const unscored = run({ run_id: "unscored", average_parse: undefined, started_at: "2026-09-11T12:00:00Z" });

    const [result] = filterPerformanceRunSeries([
      { id: "priest", runs: [scored, unscored], spec: null, subSpec: null },
    ], "parse", "180d", now);

    expect(result.rawRuns).toHaveLength(2);
    expect(result.runs.map((item) => item.run_id)).toEqual(["scored"]);
  });
});

describe("calculatePerformanceWaterlines", () => {
  it("calculates the full average and the average of the best three values", () => {
    expect(calculatePerformanceWaterlines([100, 200, 300, 400])).toEqual({
      average: 250,
      bestThreeAverage: 300,
    });
  });

  it("uses all available values when fewer than three runs exist", () => {
    expect(calculatePerformanceWaterlines([100, 300])?.bestThreeAverage).toBe(200);
    expect(calculatePerformanceWaterlines([])).toBeNull();
  });
});

describe("performanceValue", () => {
  it("selects DPS, HPS, or parse values", () => {
    const value = run();
    expect(performanceValue(value, "dps", "raw")).toBe(200);
    expect(performanceValue(value, "hps", "raw")).toBe(60);
    expect(performanceValue(value, "dps", "parse")).toBe(87.5);
  });
});
