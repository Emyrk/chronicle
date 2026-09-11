import { describe, expect, it } from "vitest";
import type { ClassTalentData, TalentEntry, TalentTabData } from "@/components/ui/TalentTreeViewer/talentLogic";
import {
  dominantTalentTreeIndex,
  resolvePlayerSpecialization,
} from "./playerSpecialization";

function talent(name: string, tabIndex: number): TalentEntry {
  return {
    id: tabIndex + 1,
    name,
    tierID: 0,
    columnIndex: tabIndex,
    maxRank: 5,
    tabIndex,
    spellRanks: [],
    iconTexture: "",
  };
}

function tab(
  name: string,
  iconTexture: string,
  orderIndex: number,
  talents: TalentEntry[] = [],
): TalentTabData {
  return {
    id: orderIndex + 1,
    name,
    backgroundFile: "",
    orderIndex,
    iconTexture,
    talents,
  };
}

const warrior: ClassTalentData = {
  id: 1,
  name: "Warrior",
  tabs: [
    tab("Protection", "ability_warrior_defensivestance", 2),
    tab("Arms", "ability_warrior_savageblow", 0),
    tab("Fury", "ability_warrior_innerrage", 1),
  ],
};

describe("dominantTalentTreeIndex", () => {
  it("returns the unique tree with the most points", () => {
    expect(dominantTalentTreeIndex([20, 31, 0])).toBe(1);
  });

  it("does not guess for tied or empty allocations", () => {
    expect(dominantTalentTreeIndex([25, 25, 1])).toBeNull();
    expect(dominantTalentTreeIndex([0, 0, 0])).toBeNull();
  });
});

describe("resolvePlayerSpecialization", () => {
  it("uses talent tab order rather than response array order", () => {
    expect(resolvePlayerSpecialization(
      { heroClass: "Warrior", summary: [0, 31, 20], trees: ["", "", ""] },
      { "1": warrior },
    )).toEqual({
      name: "Fury",
      iconUrl: "/c/icons/spec_warrior_fury.png",
    });
  });

  it("resolves configured subspecs from full talent ranks", () => {
    const shaman: ClassTalentData = {
      id: 7,
      name: "Shaman",
      tabs: [
        tab("Elemental", "", 0),
        tab("Enhancement", "", 1, [
          talent("Totemic Alignment", 0),
          talent("Ancestral Guardian", 1),
          talent("Spirit Armor", 2),
        ]),
        tab("Restoration", "", 2),
      ],
    };

    expect(resolvePlayerSpecialization(
      { heroClass: "Shaman", summary: [22, 29, 0], trees: ["", "111", ""] },
      { "7": shaman },
      ["vanilla", "nightmare-of-ursol"],
    )).toMatchObject({ name: "Enhancement", subSpec: "Tank" });

    expect(resolvePlayerSpecialization(
      { heroClass: "Shaman", summary: [22, 29, 0], trees: ["", "101", ""] },
      { "7": shaman },
      ["vanilla", "nightmare-of-ursol"],
    )).toMatchObject({ name: "Enhancement", subSpec: "DPS" });
  });

  it("normalizes spaced class names and falls back when metadata is missing", () => {
    expect(resolvePlayerSpecialization(
      { heroClass: "Death Knight", summary: [51, 0, 0], trees: ["", "", ""] },
      {},
    )).toBeNull();
  });
});
