import { describe, expect, it } from "vitest";
import type { InstanceTimeParsesResponse, SpeedrunCohortRun } from "@/api/typesGenerated";
import {
  averageKillTimePercentile,
  buildEncounterKillTimeComparisonRows,
  killTimePercentile,
  mapSnapshotBossParses,
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
// Snapshot-backed parse mapping
// ---------------------------------------------------------------------------

function makeTimeParsesResponse(
  overrides: Partial<InstanceTimeParsesResponse> = {},
): InstanceTimeParsesResponse {
  return {
    available: true,
    snapshot_id: "00000000-0000-0000-0000-000000000001",
    cutoff: "2026-07-01T00:00:00Z",
    lookback_days: 60,
    policy_version: 1,
    query_version: 1,
    boss_kill_times: [],
    ...overrides,
  };
}

describe("mapSnapshotBossParses", () => {
  it("returns null when snapshot is unavailable", () => {
    expect(mapSnapshotBossParses(undefined)).toBeNull();
    expect(mapSnapshotBossParses(makeTimeParsesResponse({ available: false }))).toBeNull();
  });

  it("maps scored bosses by encounter name", () => {
    const resp = makeTimeParsesResponse({
      boss_kill_times: [
        { encounter_name: "Lucifron", duration_ms: 90_000, precise_score: 85.5, display_score: 86, rank: 5, sample_size: 50, status: "scored" },
        { encounter_name: "Magmadar", duration_ms: 120_000, precise_score: 72.3, display_score: 72, rank: 10, sample_size: 50, status: "scored" },
      ],
    });

    const result = mapSnapshotBossParses(resp);
    expect(result).not.toBeNull();
    expect(result!.get("Lucifron")).toEqual({ displayScore: 86, sampleSize: 50, status: "scored" });
    expect(result!.get("Magmadar")).toEqual({ displayScore: 72, sampleSize: 50, status: "scored" });
  });

  it("maps sample_too_small bosses to null entry", () => {
    const resp = makeTimeParsesResponse({
      boss_kill_times: [
        { encounter_name: "Lucifron", duration_ms: 90_000, precise_score: 0, display_score: 0, rank: 0, sample_size: 3, status: "sample_too_small" },
      ],
    });

    const result = mapSnapshotBossParses(resp);
    expect(result).not.toBeNull();
    expect(result!.get("Lucifron")).toBeNull();
  });
});

describe("resolveEncounterParseScore", () => {
  it("returns display score when snapshot has a scored boss", () => {
    const snapshotParses = new Map([
      ["Lucifron", { displayScore: 86, sampleSize: 50, status: "scored" }],
    ]);
    expect(resolveEncounterParseScore(snapshotParses, "Lucifron")).toBe(86);
  });

  it("returns null when snapshot is null (unavailable)", () => {
    expect(resolveEncounterParseScore(null, "Lucifron")).toBeNull();
  });

  it("returns null when boss is missing from snapshot", () => {
    const snapshotParses = new Map([
      ["Magmadar", { displayScore: 72, sampleSize: 50, status: "scored" }],
    ]);
    expect(resolveEncounterParseScore(snapshotParses, "Lucifron")).toBeNull();
  });

  it("returns null when boss entry is null (sample_too_small)", () => {
    const snapshotParses = new Map<string, { displayScore: number; sampleSize: number; status: string } | null>([
      ["Lucifron", null],
    ]);
    expect(resolveEncounterParseScore(snapshotParses, "Lucifron")).toBeNull();
  });

  it("uses snapshot scores instead of client-side cohort percentiles", () => {
    // Simulate: client-side cohort would calculate percentile = 60,
    // but snapshot says display_score = 92. The snapshot should win.
    const snapshotParses = new Map([
      ["Lucifron", { displayScore: 92, sampleSize: 100, status: "scored" }],
    ]);

    // Client-side calculation would give a different result
    const clientSidePercentile = killTimePercentile(250_000, [100_000, 200_000, 300_000, 400_000, 500_000]);
    expect(clientSidePercentile).toBe(60); // Client would say 60

    // Snapshot wins — resolveEncounterParseScore returns the snapshot score
    expect(resolveEncounterParseScore(snapshotParses, "Lucifron")).toBe(92);
  });
});
