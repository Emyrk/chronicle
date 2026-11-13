import { describe, expect, it } from "vitest";
import { transformToInstance } from "./transformInstance";

it("preserves optional receipt metadata for the instance header", () => {
  const repairs = [{ operation_id: "job", operation: "razorgore-phase-two", version: 1,
    applied_at: "2026-11-13T12:00:00Z", warnings: [], details: { phases: [], omissions: [] } }];
  const metadata = { id: "instance", owner_ads_free: false, log_group_id: "log", name: "Blackwing Lair",
    start_time: "2026-11-13T12:00:00Z", end_time: "2026-11-13T13:00:00Z", encounters: [], players: {}, units: {} };
  const repairedMetadata = { ...metadata, repairs };
  expect(transformToInstance(repairedMetadata).repairs).toEqual(repairs);
  expect(transformToInstance(metadata).repairs).toBeUndefined();
});

describe("transformToInstance difficulty metadata", () => {
  it("preserves the instance difficulty set and encounter snapshots", () => {
    const instance = transformToInstance({
      id: "instance-id",
      owner_ads_free: false,
      log_group_id: "log-group-id",
      name: "Icecrown Citadel",
      start_time: "2026-10-10T12:00:00Z",
      end_time: "2026-10-10T14:00:00Z",
      difficulty_name: "25 Player",
      max_players: 25,
      dynamic_difficulty: 0,
      mixed_difficulty: true,
      difficulties: ["", "heroic", "mythic"],
      encounters: [
        {
          id: "encounter-id",
          instance_id: "instance-id",
          boss: true,
          name: "Lady Deathwhisper",
          map_id: 631,
          kill_type: "clean",
          start_time: "2026-10-10T13:00:00Z",
          end_time: "2026-10-10T13:10:00Z",
          difficulty: "heroic",
          hostiles: [],
        },
      ],
      players: {},
      units: {},
    });

    expect(instance.mixedDifficulty).toBe(true);
    expect(instance.difficulties).toEqual(["", "heroic", "mythic"]);
    expect(instance.encounters[0]).toMatchObject({ difficulty: "heroic" });
  });
});
