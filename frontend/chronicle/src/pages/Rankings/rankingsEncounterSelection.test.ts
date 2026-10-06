import { describe, expect, it } from "vitest";
import {
  defaultRankingBossNames,
  rankingEncounterNames,
  rankingEncounterSections,
} from "./rankingsEncounterSelection";

describe("rankingEncounterNames", () => {
  it("includes configured encounters without recorded kills", () => {
    expect(
      rankingEncounterNames(
        ["Flame Leviathan", "Razorscale", "Trash"],
        ["Flame Leviathan", "Ignis the Furnace Master"],
        ["Razorscale", "XT-002 Deconstructor"],
      ),
    ).toEqual([
      "Flame Leviathan",
      "Ignis the Furnace Master",
      "Razorscale",
      "XT-002 Deconstructor",
      "Trash",
    ]);
  });

  it("preserves recorded encounters when canonical metadata is unavailable", () => {
    expect(rankingEncounterNames(["Boss", "Trash"])).toEqual(["Boss", "Trash"]);
  });
});

describe("defaultRankingBossNames", () => {
  it("uses the configured default while leaving other bosses available", () => {
    const encounterNames = ["Flame Leviathan", "Elder Brightleaf", "Freya", "Trash"];

    expect([...defaultRankingBossNames(encounterNames, ["Freya"])]).toEqual(["Freya"]);
    expect(encounterNames).toContain("Flame Leviathan");
    expect(encounterNames).toContain("Elder Brightleaf");
  });

  it("defaults to every boss when canonical metadata is unavailable", () => {
    expect([...defaultRankingBossNames(["Boss", "Trash"])]).toEqual(["Boss"]);
  });
});

describe("rankingEncounterSections", () => {
  it("places optional bosses between progression bosses and trash", () => {
    const encounterNames = ["Flame Leviathan", "Elder Brightleaf", "Freya", "Trash"];
    const progressionBossNames = new Set(["Flame Leviathan", "Freya"]);

    expect(rankingEncounterSections(encounterNames, progressionBossNames)).toEqual([
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
