import { describe, expect, it } from "vitest";
import type { SpeedrunCohortRun } from "@/api/typesGenerated";
import {
  averageKillTimePercentile,
  killTimePercentile,
  summarizeEncounterKillTimes,
} from "./encounterKillTimePopulation";

function run(killTimes: Array<[string, number]>): SpeedrunCohortRun {
  return {
    instance_id: crypto.randomUUID(),
    slug: "raid",
    start_time: "2026-07-01T00:00:00Z",
    requirements_complete: true,
    qualified: true,
    requirements_satisfied: 1,
    requirements_total: 1,
    encounter_kill_times: killTimes.map(([encounter_name, duration_ms]) => ({
      encounter_name,
      duration_ms,
    })),
  };
}

describe("summarizeEncounterKillTimes", () => {
  it("builds a boxplot distribution for each encounter", () => {
    const summaries = summarizeEncounterKillTimes([
      run([["Lucifron", 100_000]]),
      run([["Lucifron", 200_000]]),
      run([["Lucifron", 300_000]]),
      run([["Lucifron", 400_000]]),
      run([["Lucifron", 500_000]]),
    ]);

    expect(summaries.get("Lucifron")).toMatchObject({
      count: 5,
      min: 100_000,
      q1: 200_000,
      median: 300_000,
      q3: 400_000,
      max: 500_000,
    });
  });

  it("keeps only the fastest repeated clean kill per raid", () => {
    const summaries = summarizeEncounterKillTimes([
      run([["Lucifron", 120_000], ["Lucifron", 90_000]]),
    ]);

    expect(summaries.get("Lucifron")?.values).toEqual([90_000]);
  });
});

describe("killTimePercentile", () => {
  it("scores faster times higher", () => {
    const population = [100_000, 200_000, 300_000, 400_000, 500_000];
    expect(killTimePercentile(100_000, population)).toBe(100);
    expect(killTimePercentile(250_000, population)).toBe(60);
    expect(killTimePercentile(600_000, population)).toBe(0);
  });

  it("returns null until the comparison population has five samples", () => {
    expect(killTimePercentile(100_000, [])).toBeNull();
    expect(killTimePercentile(100_000, [100_000, 200_000, 300_000, 400_000])).toBeNull();
  });
});

describe("averageKillTimePercentile", () => {
  it("rounds the arithmetic mean of available encounter parses", () => {
    expect(averageKillTimePercentile([100, 75, null, 40])).toBe(72);
  });

  it("returns null without available encounter parses", () => {
    expect(averageKillTimePercentile([null, null])).toBeNull();
  });
});
