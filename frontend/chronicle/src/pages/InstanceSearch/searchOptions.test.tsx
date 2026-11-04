import { describe, expect, it } from "vitest";
import type { SupportedInstance } from "@/api/typesGenerated";
import { zoneOptions } from "./searchOptions";

const instances = [
  { name: "Molten Core", category: "raid", raid_progression_order: 100 },
  { name: "Tower of Karazhan", category: "raid", raid_progression_order: 900 },
  { name: "Karazhan", category: "raid", raid_progression_order: 1000 },
  { name: "Naxxramas", category: "raid", raid_progression_order: 2030 },
  { name: "Ulduar", category: "raid", raid_progression_order: 2100 },
  { name: "Deadmines", category: "dungeon" },
] as SupportedInstance[];

describe("zoneOptions", () => {
  it("groups raids by level with the highest tiers and progression first", () => {
    const options = zoneOptions(instances);

    expect(options.map(({ value, group }) => ({ value, group }))).toEqual([
      { value: "Ulduar", group: "Level 80 raids" },
      { value: "Naxxramas", group: "Level 80 raids" },
      { value: "Karazhan", group: "Level 70 raids" },
      { value: "Tower of Karazhan", group: "Level 60 raids" },
      { value: "Molten Core", group: "Level 60 raids" },
      { value: "Deadmines", group: "Dungeons" },
    ]);
  });

  it("replaces Tower of Karazhan with its upper and lower raids for Nightmare of Ursol", () => {
    const options = zoneOptions(instances, ["nightmare-of-ursol"]);

    expect(options.map(({ value }) => value)).toEqual([
      "Ulduar",
      "Naxxramas",
      "Karazhan",
      "Upper Tower of Karazhan",
      "Lower Tower of Karazhan",
      "Molten Core",
      "Deadmines",
    ]);
  });
});
