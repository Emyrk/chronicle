import { describe, expect, it } from "vitest";
import type { InstanceTimeParsesResponse, SpeedrunCohortRun } from "@/api/typesGenerated";
import {
  averageKillTimePercentile,
  bossKillParsesByEncounter,
  buildEncounterKillTimeComparisonRows,
  killTimePercentile,
  mapTimeBossParses,
  resolveEncounterParseScore,
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

describe("buildEncounterKillTimeComparisonRows", () => {
  it("keeps comparison bosses that are missing from the primary raid", () => {
    const primary = summarizeEncounterKillTimes([run([["Lucifron", 100_000]])]);
    const comparison = summarizeEncounterKillTimes([
      run([["Lucifron", 120_000], ["Magmadar", 180_000]]),
    ]);

    const rows = buildEncounterKillTimeComparisonRows(primary, comparison);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.encounterName === "Magmadar")).toMatchObject({
      primarySummary: null,
      percentile: null,
    });
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

// ---------------------------------------------------------------------------
// Live time-parse mapping
// ---------------------------------------------------------------------------

function makeTimeParsesResponse(
  overrides: Partial<InstanceTimeParsesResponse> = {},
): InstanceTimeParsesResponse {
  return {
    available: true,
    cutoff: "2026-07-01T00:00:00Z",
    lookback_days: 60,
    policy_version: 1,
    query_version: 1,
    computed_at: "2026-07-01T00:00:00Z",
    scopes: {},
    boss_kill_times: [],
    ...overrides,
  };
}

describe("bossKillParsesByEncounter", () => {
  it("returns null when time parses are unavailable", () => {
    expect(bossKillParsesByEncounter(undefined)).toBeNull();
    expect(bossKillParsesByEncounter(makeTimeParsesResponse({ available: false }))).toBeNull();
  });

  it("indexes repeat kills of the same boss by encounter ID", () => {
    const resp = makeTimeParsesResponse({
      boss_kill_times: [
        { encounter_id: "00000000-0000-0000-0000-000000000001", encounter_name: "Lucifron", duration_ms: 90_000, precise_score: 85.5, display_score: 86, rank: 5, sample_size: 50, status: "ok" },
        { encounter_id: "00000000-0000-0000-0000-000000000002", encounter_name: "Lucifron", duration_ms: 120_000, precise_score: 40.1, display_score: 40, rank: 30, sample_size: 50, status: "ok" },
      ],
    });

    const result = bossKillParsesByEncounter(resp);
    expect(result?.get("00000000-0000-0000-0000-000000000001")?.display_score).toBe(86);
    expect(result?.get("00000000-0000-0000-0000-000000000002")?.display_score).toBe(40);
  });
});

describe("mapTimeBossParses", () => {
  it("returns null when time parses are unavailable", () => {
    expect(mapTimeBossParses(undefined)).toBeNull();
    expect(mapTimeBossParses(makeTimeParsesResponse({ available: false }))).toBeNull();
  });

  it("maps scored bosses by encounter name", () => {
    const resp = makeTimeParsesResponse({
      boss_kill_times: [
        { encounter_id: "00000000-0000-0000-0000-000000000001", encounter_name: "Lucifron", duration_ms: 90_000, precise_score: 85.5, display_score: 86, rank: 5, sample_size: 50, status: "scored" },
        { encounter_id: "00000000-0000-0000-0000-000000000002", encounter_name: "Magmadar", duration_ms: 120_000, precise_score: 72.3, display_score: 72, rank: 10, sample_size: 50, status: "scored" },
      ],
    });

    const result = mapTimeBossParses(resp);
    expect(result).not.toBeNull();
    expect(result!.get("Lucifron")).toEqual({ displayScore: 86, sampleSize: 50, status: "scored" });
    expect(result!.get("Magmadar")).toEqual({ displayScore: 72, sampleSize: 50, status: "scored" });
  });

  it("maps sample_too_small bosses to null entry", () => {
    const resp = makeTimeParsesResponse({
      boss_kill_times: [
        { encounter_id: "00000000-0000-0000-0000-000000000001", encounter_name: "Lucifron", duration_ms: 90_000, precise_score: 0, display_score: 0, rank: 0, sample_size: 3, status: "sample_too_small" },
      ],
    });

    const result = mapTimeBossParses(resp);
    expect(result).not.toBeNull();
    expect(result!.get("Lucifron")).toBeNull();
  });
});

describe("resolveEncounterParseScore", () => {
  it("returns display score when time-parse response has a scored boss", () => {
    const timeParses = new Map([
      ["Lucifron", { displayScore: 86, sampleSize: 50, status: "scored" }],
    ]);
    expect(resolveEncounterParseScore(timeParses, "Lucifron")).toBe(86);
  });

  it("returns null when time parses are null (unavailable)", () => {
    expect(resolveEncounterParseScore(null, "Lucifron")).toBeNull();
  });

  it("returns null when boss is missing from time parses", () => {
    const timeParses = new Map([
      ["Magmadar", { displayScore: 72, sampleSize: 50, status: "scored" }],
    ]);
    expect(resolveEncounterParseScore(timeParses, "Lucifron")).toBeNull();
  });

  it("returns null when boss entry is null (sample_too_small)", () => {
    const timeParses = new Map<string, { displayScore: number; sampleSize: number; status: string } | null>([
      ["Lucifron", null],
    ]);
    expect(resolveEncounterParseScore(timeParses, "Lucifron")).toBeNull();
  });

  it("uses server scores instead of client-side cohort percentiles", () => {
    // Simulate: client-side cohort would calculate percentile = 60,
    // but the API says display_score = 92. The API score should win.
    const timeParses = new Map([
      ["Lucifron", { displayScore: 92, sampleSize: 100, status: "scored" }],
    ]);

    // Client-side calculation would give a different result
    const clientSidePercentile = killTimePercentile(250_000, [100_000, 200_000, 300_000, 400_000, 500_000]);
    expect(clientSidePercentile).toBe(60); // Client would say 60

    // The API score wins — resolveEncounterParseScore returns it
    expect(resolveEncounterParseScore(timeParses, "Lucifron")).toBe(92);
  });
});
