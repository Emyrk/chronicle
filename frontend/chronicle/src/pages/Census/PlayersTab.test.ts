import { describe, expect, it } from "vitest";
import { raceFaction, raceName } from "./censusRace";

const NIGHTMARE_OF_URSOL = ["vanilla", "nightmare-of-ursol"];

describe("census race presentation", () => {
  it("presents Blood Elves as Alliance High Elves for Nightmare of Ursol tenants", () => {
    expect(raceName("BloodElf", NIGHTMARE_OF_URSOL)).toBe("High Elf");
    expect(raceFaction("BloodElf", NIGHTMARE_OF_URSOL)).toBe("Alliance");
  });

  it("uses an explicit faction for a bifactional race", () => {
    expect(raceFaction("Skyborne", [], "Alliance")).toBe("Alliance");
    expect(raceFaction("Skyborne", [], "Horde")).toBe("Horde");
  });

  it("presents Skyborne without assigning a fixed faction", () => {
    expect(raceName("Skyborne", [])).toBe("Skyborne");
    expect(raceFaction("Skyborne", [])).toBe("Unknown");
  });

  it("presents Blood Elves as Horde for other flavors", () => {
    const chromieFlavor = ["wrath", "azerothcore", "chromiecraft"];

    expect(raceName("BloodElf", chromieFlavor)).toBe("Blood Elf");
    expect(raceFaction("BloodElf", chromieFlavor)).toBe("Horde");
  });
});
