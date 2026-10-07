import { describe, expect, it } from "vitest";
import { raceFaction, raceName } from "./censusRace";

const NIGHTMARE_OF_URSOL = ["vanilla", "nightmare-of-ursol"];

describe("census race presentation", () => {
  it("presents Blood Elves as Alliance High Elves for Nightmare of Ursol tenants", () => {
    expect(raceName("BloodElf", NIGHTMARE_OF_URSOL)).toBe("High Elf");
    expect(raceFaction("BloodElf", NIGHTMARE_OF_URSOL)).toBe("Alliance");
  });

  it("keeps the standard Blood Elf name for other flavors", () => {
    expect(raceName("BloodElf", ["wrath"])).toBe("Blood Elf");
  });
});
