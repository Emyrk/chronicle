import { describe, expect, it } from "vitest";
import type { CharacterEncounterStats, CharacterPerformanceRun } from "@/api/typesGenerated";
import {
  buildPerformanceVariants,
  calculatePerformanceWaterlines,
  filterPerformanceRuns,
  filterPerformanceRunsByDate,
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
    run({ run_id: "old", started_at: "2026-06-01T12:00:00Z" }),
  ];

  it("supports all-time, 60-day, and 30-day windows", () => {
    expect(filterPerformanceRunsByDate(runs, "all", now)).toHaveLength(3);
    expect(filterPerformanceRunsByDate(runs, "60d", now).map((item) => item.run_id)).toEqual(["recent", "within-60"]);
    expect(filterPerformanceRunsByDate(runs, "30d", now).map((item) => item.run_id)).toEqual(["recent"]);
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
