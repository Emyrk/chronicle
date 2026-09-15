import { describe, expect, it } from "vitest";
import {
  defaultRankingBossNames,
  rankingEncounterNames,
  rankingEncounterSections,
} from "./rankingsEncounterSelection";

describe("rankingEncounterNames", () => {
  it("includes canonical progression bosses without recorded kills", () => {
    const progressionBosses = new Map([
      ["Ulduar", new Set(["Flame Leviathan", "Ignis the Furnace Master", "Razorscale", "XT-002 Deconstructor"])],
    ]);

    expect(
      rankingEncounterNames("Ulduar", ["Flame Leviathan", "Razorscale", "Trash"], progressionBosses),
    ).toEqual([
      "Flame Leviathan",
      "Ignis the Furnace Master",
      "Razorscale",
      "XT-002 Deconstructor",
      "Trash",
    ]);
  });

  it("preserves recorded encounters when canonical metadata is unavailable", () => {
    expect(rankingEncounterNames("Unknown", ["Boss", "Trash"], new Map())).toEqual(["Boss", "Trash"]);
  });
});

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

describe("Emerald Sanctum progression", () => {
  it("treats Erennius and both Solnius variants as progression bosses", () => {
    const encounterNames = ["Erennius", "Solnius", "Solnius (Hard Mode)"];
    const progressionBosses = new Set(encounterNames);

    expect(rankingEncounterSections(encounterNames, progressionBosses)).toEqual([
      {
        label: "Bosses",
        kind: "boss",
        names: encounterNames,
      },
    ]);
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
