import { describe, expect, it } from "vitest";
import type { CharacterPerformanceRun } from "@/api/typesGenerated";
import { performanceRunEntity } from "./performanceEntities";

const run: CharacterPerformanceRun = {
  run_id: "run-id",
  representative_instance_id: "instance-id",
  started_at: "2026-11-13T01:00:00Z",
  killed_at: "2026-11-13T02:00:00Z",
  player_name: "Thrall",
  player_class: "SHAMAN",
  player_spec: "Enhancement",
  encounter_count: 8,
  damage_done: 1000,
  healing_done: 0,
  absorbed_done: 0,
  duration_secs: 3600.125,
  dps: 100,
  hps: 0,
  log_hashed_slug: "raid-slug",
};

describe("performance run Alt mode entities", () => {
  it("describes the concrete raid instance represented by a run", () => {
    expect(performanceRunEntity(run, "Blackwing Lair", "Normal", 40)).toEqual({
      kind: "raid",
      id: "instance-id",
      name: "Blackwing Lair",
      difficultyName: "Normal",
      maxPlayers: 40,
      logId: "instance-id",
      clearMs: 3_600_125,
      startTime: "2026-11-13T01:00:00Z",
    });
  });
});
