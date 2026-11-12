import { describe, expect, it } from "vitest";
import { transformToInstance } from "./transformInstance";

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
      difficulties: [
        { difficulty_name: "25 Player", max_players: 25, dynamic_difficulty: 0 },
        { difficulty_name: "25 Player (Heroic)", max_players: 25, dynamic_difficulty: 1 },
      ],
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
          difficulty_name: "25 Player (Heroic)",
          max_players: 25,
          dynamic_difficulty: 1,
          hostiles: [],
        },
      ],
      players: {},
      units: {},
    });

    expect(instance.mixedDifficulty).toBe(true);
    expect(instance.difficulties).toEqual([
      { difficultyName: "25 Player", maxPlayers: 25, dynamicDifficulty: 0 },
      { difficultyName: "25 Player (Heroic)", maxPlayers: 25, dynamicDifficulty: 1 },
    ]);
    expect(instance.encounters[0]).toMatchObject({
      difficultyName: "25 Player (Heroic)",
      maxPlayers: 25,
      dynamicDifficulty: 1,
    });
  });
});
