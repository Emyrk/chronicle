import { describe, expect, it } from "vitest";
import type { SpeedrunCohortRun } from "@/api/typesGenerated";
import { summarizeTimeCompositions, timeComposition } from "./timeCompositionPopulation";

function run(
  encounterSpanMs: number,
  combatMs: number,
  bossMs: number,
): SpeedrunCohortRun {
  return {
    instance_id: crypto.randomUUID(),
    slug: "raid",
    start_time: "2026-07-01T00:00:00Z",
    requirements_complete: true,
    qualified: true,
    requirements_satisfied: 1,
    requirements_total: 1,
    encounter_kill_times: [],
    overview: {
      requirements_complete: true,
      player_deaths: 0,
      wipe_count: 0,
      encounter_span_duration_ms: encounterSpanMs,
      total_combat_duration_ms: combatMs,
      total_boss_duration_ms: bossMs,
      metrics_version: 1,
    },
  };
}

describe("timeComposition", () => {
  it("derives boss, trash, and idle time from persisted overview metrics", () => {
    expect(timeComposition(run(100_000, 70_000, 30_000))).toEqual({
      boss: 30_000,
      trash: 40_000,
      idle: 30_000,
      total: 100_000,
    });
  });

  it("rejects missing or inconsistent metrics", () => {
    const missing = { ...run(100_000, 70_000, 30_000), overview: undefined };
    expect(timeComposition(missing)).toBeNull();
    expect(timeComposition(run(60_000, 70_000, 30_000))).toBeNull();
    expect(timeComposition(run(100_000, 60_000, 70_000))).toBeNull();
  });
});

describe("summarizeTimeCompositions", () => {
  it("builds a cohort distribution for each time component", () => {
    const summary = summarizeTimeCompositions([
      run(100_000, 70_000, 30_000),
      run(120_000, 80_000, 40_000),
      run(140_000, 90_000, 50_000),
    ]);

    expect(summary?.boss).toMatchObject({ count: 3, min: 30_000, median: 40_000, max: 50_000 });
    expect(summary?.trash).toMatchObject({ count: 3, min: 40_000, median: 40_000, max: 40_000 });
    expect(summary?.idle).toMatchObject({ count: 3, min: 30_000, median: 40_000, max: 50_000 });
  });

  it("excludes incomplete raids from cohort summaries", () => {
    const incomplete = { ...run(60_000, 40_000, 20_000), requirements_complete: false };

    const summary = summarizeTimeCompositions([
      incomplete,
      run(100_000, 70_000, 30_000),
    ]);

    expect(summary?.boss).toMatchObject({ count: 1, median: 30_000 });
  });
});
