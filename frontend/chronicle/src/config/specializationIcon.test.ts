import { describe, expect, it } from "vitest";
import { specializationIconUrl } from "./specializationIcon";

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
});
