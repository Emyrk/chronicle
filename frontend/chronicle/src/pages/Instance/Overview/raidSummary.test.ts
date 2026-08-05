import { describe, expect, it } from "vitest";
import type { SpeedrunCohortRun } from "@/api/typesGenerated";
import { summarizeComparisonRaids, summarizePrimaryRaid } from "./raidSummary";

function run({
  durationMs,
  complete = true,
  qualified = true,
  deaths,
  wipes,
}: {
  durationMs?: number;
  complete?: boolean;
  qualified?: boolean;
  deaths?: number;
  wipes?: number;
}): SpeedrunCohortRun {
  return {
    instance_id: crypto.randomUUID(),
    slug: "raid",
    start_time: "2026-07-01T20:00:00Z",
    duration_ms: durationMs,
    requirements_complete: complete,
    qualified,
    requirements_satisfied: complete ? 1 : 0,
    requirements_total: 1,
    encounter_kill_times: [],
    overview: deaths === undefined || wipes === undefined ? undefined : {
      requirements_complete: complete,
      player_deaths: deaths,
      wipe_count: wipes,
      encounter_span_duration_ms: durationMs ?? 0,
      total_combat_duration_ms: 0,
      total_boss_duration_ms: 0,
      metrics_version: 1,
    },
  };
}

describe("raid summary", () => {
  it("uses the singular raid's exact values", () => {
    expect(summarizePrimaryRaid(run({ durationMs: 4_200_000, deaths: 13, wipes: 3 }))).toEqual({
      clearTimeMs: 4_200_000,
      playerDeaths: 13,
      wipeCount: 3,
    });
  });

  it("averages complete comparison runs and ignores incomplete runs", () => {
    expect(summarizeComparisonRaids([
      run({ durationMs: 4_000_000, deaths: 10, wipes: 2 }),
      run({ durationMs: 5_000_000, deaths: 20, wipes: 4, qualified: false }),
      run({ durationMs: 1_000_000, deaths: 1, wipes: 0, complete: false }),
    ])).toEqual({
      clearTimeMs: 4_500_000,
      playerDeaths: 15,
      wipeCount: 3,
    });
  });

  it("returns missing overview metrics without inventing zeroes", () => {
    expect(summarizePrimaryRaid(run({ durationMs: 4_200_000 }))).toEqual({
      clearTimeMs: 4_200_000,
      playerDeaths: null,
      wipeCount: null,
    });
  });
});
