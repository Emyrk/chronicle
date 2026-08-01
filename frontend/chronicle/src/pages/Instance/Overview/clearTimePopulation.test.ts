import { describe, expect, it } from "vitest";
import type { SpeedrunCohortRun } from "@/api/typesGenerated";
import { clearTimeParse, summarizeClearTimes } from "./clearTimePopulation";

function run(durationMs: number | undefined, qualified = true): SpeedrunCohortRun {
  return {
    instance_id: crypto.randomUUID(),
    slug: "raid",
    start_time: "2026-07-01T00:00:00Z",
    duration_ms: durationMs,
    requirements_complete: durationMs !== undefined,
    qualified,
    requirements_satisfied: durationMs !== undefined ? 1 : 0,
    requirements_total: 1,
    encounter_kill_times: [],
  };
}

describe("summarizeClearTimes", () => {
  it("ignores incomplete and unqualified runs", () => {
    const summary = summarizeClearTimes([
      run(1_000),
      run(2_000),
      run(undefined),
      run(500, false),
    ]);

    expect(summary).toMatchObject({ count: 2, best: 1_000, median: 1_500, mean: 1_500 });
  });

  it("returns quartiles for distribution rendering", () => {
    expect(summarizeClearTimes([run(1_000), run(2_000), run(3_000), run(4_000), run(5_000)]))
      .toMatchObject({ min: 1_000, q1: 2_000, median: 3_000, q3: 4_000, max: 5_000 });
  });

  it("returns null without qualified clear times", () => {
    expect(summarizeClearTimes([run(undefined), run(1_000, false)])).toBeNull();
  });
});

describe("clearTimeParse", () => {
  it("scores faster qualified speedrun clears higher", () => {
    const cohort = [run(1_000), run(2_000), run(3_000), run(4_000), run(5_000)];
    expect(clearTimeParse(run(1_000), cohort)).toBe(100);
    expect(clearTimeParse(run(3_000), cohort)).toBe(60);
    expect(clearTimeParse(run(6_000), cohort)).toBe(0);
  });

  it("requires a qualified primary and five qualified comparison clears", () => {
    expect(clearTimeParse(run(1_000, false), [run(1_000), run(2_000), run(3_000), run(4_000), run(5_000)]))
      .toBeNull();
    expect(clearTimeParse(run(1_000), [run(1_000), run(2_000), run(3_000), run(4_000)]))
      .toBeNull();
  });
});
