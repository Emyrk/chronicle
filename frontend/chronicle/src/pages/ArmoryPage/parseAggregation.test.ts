import { describe, expect, it } from "vitest";
import type { CharacterEncounterStats, PlayerOutfit } from "@/api/typesGenerated";
import { averageItemLevel, summarizeProgress } from "./parseAggregation";

function encounter(overrides: Partial<CharacterEncounterStats>): CharacterEncounterStats {
  return {
    instance_name: "Ulduar",
    encounter_name: "Flame Leviathan",
    difficulty_name: "10 Player",
    max_players: 10,
    kills: 1,
    first_killed_at: "2026-09-01T00:00:00Z",
    last_killed_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

describe("summarizeProgress", () => {
  it("uses canonical bosses and excludes optional encounters", () => {
    const progress = summarizeProgress(
      [
        encounter({ encounter_name: "Flame Leviathan", kills: 3 }),
        encounter({ encounter_name: "Ignis the Furnace Master", kills: 2 }),
        encounter({ encounter_name: "Elder Brightleaf", kills: 5 }),
      ],
      new Map([
        ["Ulduar", new Set(["Flame Leviathan", "Ignis the Furnace Master", "Razorscale"])],
      ]),
    );

    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({
      instanceName: "Ulduar",
      difficultyName: "10 Player",
      maxPlayers: 10,
      encountersDown: 2,
      killedBosses: ["Flame Leviathan", "Ignis the Furnace Master"],
      kills: 5,
    });
  });

  it("preserves all encounters for instances without canonical metadata", () => {
    const progress = summarizeProgress([
      encounter({ instance_name: "Molten Core", encounter_name: "Lucifron" }),
      encounter({ instance_name: "Molten Core", encounter_name: "Magmadar" }),
    ]);

    expect(progress[0].killedBosses).toEqual(["Lucifron", "Magmadar"]);
    expect(progress[0].encountersDown).toBe(2);
  });
});

describe("averageItemLevel", () => {
  function outfit(levels: Array<number | undefined>): PlayerOutfit {
    return levels.map((lvl) => ({
      item_id: lvl === undefined ? 0 : 1000,
      item_level: lvl,
    })) as unknown as PlayerOutfit;
  }

  it("averages equipped items, skipping shirt and tabard", () => {
    const levels: Array<number | undefined> = new Array(19).fill(undefined);
    levels[0] = 60; // head
    levels[4] = 70; // chest
    levels[3] = 1; // shirt: ignored
    levels[18] = 1; // tabard: ignored
    expect(averageItemLevel(outfit(levels))).toBe(65);
  });

  it("returns null when no item levels are known", () => {
    expect(averageItemLevel(outfit(new Array(19).fill(undefined)))).toBeNull();
  });
});
