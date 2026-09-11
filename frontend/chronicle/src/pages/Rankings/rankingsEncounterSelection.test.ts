import { describe, expect, it } from "vitest";
import { defaultRankingBossNames, rankingEncounterSections } from "./rankingsEncounterSelection";

describe("defaultRankingBossNames", () => {
  it("uses canonical progression bosses while leaving optional bosses available", () => {
    const encounterNames = ["Flame Leviathan", "Elder Brightleaf", "Freya", "Trash"];

    expect(
      [...defaultRankingBossNames(
        "Ulduar",
        encounterNames,
        new Map([["Ulduar", new Set(["Flame Leviathan", "Freya"])]]),
      )],
    ).toEqual(["Flame Leviathan", "Freya"]);
    expect(encounterNames).toContain("Elder Brightleaf");
  });

  it("defaults to every boss when canonical metadata is unavailable", () => {
    expect([...defaultRankingBossNames("Unknown", ["Boss", "Trash"], new Map())]).toEqual(["Boss"]);
  });
});

describe("rankingEncounterSections", () => {
  it("places optional bosses between progression bosses and trash", () => {
    const encounterNames = ["Flame Leviathan", "Elder Brightleaf", "Freya", "Trash"];
    const defaultBossNames = new Set(["Flame Leviathan", "Freya"]);

    expect(rankingEncounterSections(encounterNames, defaultBossNames)).toEqual([
      {
        label: "Bosses",
        kind: "boss",
        names: ["Flame Leviathan", "Freya"],
      },
      {
        label: "Optional",
        kind: "optional",
        names: ["Elder Brightleaf"],
      },
      {
        label: "Trash",
        kind: "trash",
        names: ["Trash"],
      },
    ]);
  });
});
