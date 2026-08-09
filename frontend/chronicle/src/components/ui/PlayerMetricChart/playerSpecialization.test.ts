import { describe, expect, it } from "vitest";
import type { ClassTalentData, TalentTabData } from "@/components/ui/TalentTreeViewer/talentLogic";
import {
  dominantTalentTreeIndex,
  resolvePlayerSpecialization,
} from "./playerSpecialization";

function tab(name: string, iconTexture: string, orderIndex: number): TalentTabData {
  return {
    id: orderIndex + 1,
    name,
    backgroundFile: "",
    orderIndex,
    iconTexture,
    talents: [],
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
      { heroClass: "Warrior", summary: [0, 31, 20] },
      { "1": warrior },
    )).toEqual({
      name: "Fury",
      iconTexture: "ability_warrior_innerrage",
    });
  });

  it("normalizes spaced class names and falls back when metadata is missing", () => {
    expect(resolvePlayerSpecialization(
      { heroClass: "Death Knight", summary: [51, 0, 0] },
      {},
    )).toBeNull();
  });
});
