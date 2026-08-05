import { describe, expect, it } from "vitest";
import type { CharacterParse, PlayerOutfit } from "@/api/typesGenerated";
import {
  averageItemLevel,
  bestScoreByInstance,
  summarizeRaids,
  topEncounters,
} from "./parseAggregation";

function parse(overrides: Partial<CharacterParse>): CharacterParse {
  return {
    encounter_name: "Lucifron",
    instance_name: "Molten Core",
    difficulty_name: "Normal",
    max_players: 40,
    instance_id: "inst-1",
    run_id: "run-1",
    metric: "dps",
    metric_value: 1000,
    precise_score: 50,
    display_score: 50,
    rank: 10,
    sample_size: 100,
    status: "ok",
    killed_at: "2026-08-01T20:00:00Z",
    ...overrides,
  };
}

describe("summarizeRaids", () => {
  it("averages the best 3 parses per encounter", () => {
    const raids = summarizeRaids([
      parse({ precise_score: 90, display_score: 90 }),
      parse({ precise_score: 80, display_score: 80 }),
      parse({ precise_score: 70, display_score: 70 }),
      parse({ precise_score: 10, display_score: 10 }), // dropped: only best 3 count
    ]);
    expect(raids).toHaveLength(1);
    expect(raids[0].encounters).toHaveLength(1);
    expect(raids[0].encounters[0].score).toBe(80);
    expect(raids[0].encounters[0].best).toBe(90);
    expect(raids[0].encounters[0].kills).toBe(4);
  });

  it("uses fewer parses when fewer than 3 exist", () => {
    const raids = summarizeRaids([
      parse({ precise_score: 91.4, display_score: 91 }),
      parse({ precise_score: 88.4, display_score: 88 }),
    ]);
    // (91.4 + 88.4) / 2 = 89.9 → rounds half-up to 90
    expect(raids[0].encounters[0].score).toBe(90);
  });

  it("groups by raid and difficulty, sorted by kill count", () => {
    const raids = summarizeRaids([
      parse({ instance_name: "Onyxia's Lair", encounter_name: "Onyxia" }),
      parse({ encounter_name: "Lucifron" }),
      parse({ encounter_name: "Magmadar" }),
      parse({ instance_name: "Molten Core", difficulty_name: "Heroic", encounter_name: "Lucifron" }),
    ]);
    expect(raids.map((r) => `${r.instanceName} ${r.difficultyName}`)).toEqual([
      "Molten Core Normal",
      "Onyxia's Lair Normal",
      "Molten Core Heroic",
    ]);
    expect(raids[0].kills).toBe(2);
  });

  it("raid score averages encounter scores and best is the raid-wide max", () => {
    const raids = summarizeRaids([
      parse({ encounter_name: "Lucifron", precise_score: 90, display_score: 90 }),
      parse({ encounter_name: "Magmadar", precise_score: 70, display_score: 70 }),
    ]);
    expect(raids[0].score).toBe(80);
    expect(raids[0].best).toBe(90);
  });

  it("tracks the metric value of the best parse", () => {
    const raids = summarizeRaids([
      parse({ precise_score: 90, metric_value: 1500 }),
      parse({ precise_score: 50, metric_value: 2000 }),
    ]);
    expect(raids[0].encounters[0].bestMetricValue).toBe(1500);
  });
});

describe("topEncounters", () => {
  it("returns the highest-scoring encounters across raids", () => {
    const raids = summarizeRaids([
      parse({ encounter_name: "Lucifron", precise_score: 60, display_score: 60 }),
      parse({ encounter_name: "Magmadar", precise_score: 95, display_score: 95 }),
      parse({ instance_name: "Onyxia's Lair", encounter_name: "Onyxia", precise_score: 80, display_score: 80 }),
    ]);
    const top = topEncounters(raids, 2);
    expect(top.map((e) => e.encounterName)).toEqual(["Magmadar", "Onyxia"]);
  });
});

describe("bestScoreByInstance", () => {
  it("keeps the best score per instance", () => {
    const map = bestScoreByInstance([
      parse({ instance_id: "a", display_score: 40 }),
      parse({ instance_id: "a", display_score: 90 }),
      parse({ instance_id: "b", display_score: 10 }),
    ]);
    expect(map.get("a")).toBe(90);
    expect(map.get("b")).toBe(10);
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
