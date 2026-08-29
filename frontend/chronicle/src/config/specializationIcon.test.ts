import { describe, expect, it } from "vitest";
import {
  specializationIconUrl,
  specializationIconUrlForClassID,
} from "./specializationIcon";

describe("specializationIconUrl", () => {
  it("maps class and specialization names to bundled icon paths", () => {
    expect(specializationIconUrl("Priest", "Discipline")).toBe(
      "/c/icons/spec_priest_discipline.png",
    );
    expect(specializationIconUrl("Shaman", "Enhancement")).toBe(
      "/c/icons/spec_shaman_enhancement.png",
    );
  });

  it("normalizes spaces and punctuation", () => {
    expect(specializationIconUrl("Death Knight", "Blood")).toBe(
      "/c/icons/spec_deathknight_blood.png",
    );
    expect(specializationIconUrl("Hunter", "Beast Mastery")).toBe(
      "/c/icons/spec_hunter_beastmastery.png",
    );
  });

  it("maps supported class IDs and leaves pet trees on dataset icons", () => {
    expect(specializationIconUrlForClassID(5, "Discipline")).toBe(
      "/c/icons/spec_priest_discipline.png",
    );
    expect(specializationIconUrlForClassID(7, "Enhancement")).toBe(
      "/c/icons/spec_shaman_enhancement.png",
    );
    expect(specializationIconUrlForClassID(0, "Ferocity")).toBeNull();
  });
});
