import { describe, expect, it } from "vitest";
import type { SpeedrunInstanceBoard, SupportedInstance } from "@/api/typesGenerated";
import {
  crownLeader,
  filterThrones,
  leaderboardHref,
  recentRunsHref,
  sortThrones,
  throneFreshness,
  throneTabCounts,
  thronesFromBoards,
} from "./kingOfTheHill";

const NOW = new Date("2026-10-29T12:00:00Z");

function board(instance_name: string, record?: { guild: string; at: string; ms?: number }, difficulty_name = ""): SpeedrunInstanceBoard {
  return {
    instance_name,
    difficulty_name,
    record: record && { guild_name: record.guild, completion_time: record.at, duration_ms: record.ms ?? 1_800_000 },
  };
}

const supported = [
  { name: "Molten Core", category: "raid" },
  { name: "Deadmines", category: "dungeon" },
] as SupportedInstance[];

describe("thronesFromBoards", () => {
  it("maps categories, with anything unlisted as custom, and titles difficulty boards", () => {
    const thrones = thronesFromBoards([board("Molten Core"), board("Deadmines"), board("Lower Tower of Karazhan", undefined, "Heroic")], supported);
    expect(thrones.map((t) => [t.title, t.kind])).toEqual([
      ["Molten Core", "raid"],
      ["Deadmines", "dungeon"],
      ["Lower Tower of Karazhan (Heroic)", "custom"],
    ]);
  });
});

describe("sortThrones", () => {
  it("puts the newest record first and unclaimed thrones last", () => {
    const thrones = thronesFromBoards(
      [
        board("Zul'Gurub", { guild: "Cleave", at: "2026-10-10T00:00:00Z" }),
        board("Deadmines"),
        board("Molten Core", { guild: "Cleave", at: "2026-10-27T00:00:00Z" }),
        board("Blackwing Lair"),
      ],
      supported,
    );
    expect(sortThrones(thrones).map((t) => t.title)).toEqual(["Molten Core", "Zul'Gurub", "Blackwing Lair", "Deadmines"]);
  });
});

describe("throneFreshness", () => {
  const freshness = (at?: string) => throneFreshness(thronesFromBoards([board("Molten Core", at ? { guild: "Cleave", at } : undefined)], supported)[0], NOW);

  it("says how long the record has stood", () => {
    expect(freshness("2026-10-29T08:00:00Z")).toBe("set today");
    expect(freshness("2026-10-24T08:00:00Z")).toBe("set this week");
    expect(freshness("2026-10-11T08:00:00Z")).toBe("held 18 days");
  });

  it("invites a claim on an empty throne", () => {
    expect(freshness()).toBe("be the first");
  });
});

describe("crownLeader", () => {
  it("counts the guild holding the most crowns against the claimed thrones", () => {
    const thrones = thronesFromBoards(
      [
        board("Molten Core", { guild: "Cleave", at: "2026-10-27T00:00:00Z" }),
        board("Zul'Gurub", { guild: "Cleave", at: "2026-10-10T00:00:00Z" }),
        board("Onyxia's Lair", { guild: "Bastion", at: "2026-10-01T00:00:00Z" }),
        board("Deadmines"),
      ],
      supported,
    );
    expect(crownLeader(thrones)).toEqual({ guild: "Cleave", held: 2, claimed: 3 });
  });

  it("is null when no throne is claimed", () => {
    expect(crownLeader(thronesFromBoards([board("Deadmines")], supported))).toBeNull();
  });
});

describe("wall filters", () => {
  const thrones = thronesFromBoards([board("Molten Core"), board("Deadmines"), board("Stratholme")], supported);

  it("counts each tab", () => {
    expect(throneTabCounts(thrones)).toEqual({ all: 3, raid: 1, dungeon: 1, custom: 1 });
  });

  it("filters by tab and by name or abbreviation", () => {
    expect(filterThrones(thrones, "dungeon", "").map((t) => t.title)).toEqual(["Deadmines"]);
    expect(filterThrones(thrones, "all", "strat").map((t) => t.title)).toEqual(["Stratholme"]);
    expect(filterThrones(thrones, "all", "mc").map((t) => t.title)).toEqual(["Molten Core"]);
    expect(filterThrones(thrones, "raid", "dead")).toEqual([]);
  });
});

describe("click-throughs", () => {
  it("links to the filtered leaderboard and recent runs", () => {
    const [zg, kara] = thronesFromBoards([board("Zul'Gurub"), board("Karazhan", undefined, "Heroic")], supported);
    expect(leaderboardHref(zg)).toBe("/leaderboards/speedruns?instance=Zul'Gurub&timing=full");
    expect(leaderboardHref(kara)).toBe("/leaderboards/speedruns?instance=Karazhan&timing=full&difficulty=Heroic");
    expect(recentRunsHref(zg)).toBe("/recent?inst=Zul'Gurub");
  });
});
