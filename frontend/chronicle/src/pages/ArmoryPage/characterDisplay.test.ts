import { describe, expect, it } from "vitest";
import { getRaceIconUrl } from "./characterDisplay";

const ICON_BASE_URL = "https://icons.example.test/server";

describe("getRaceIconUrl", () => {
  it.each([
    ["BloodElf", "Female", "achievement_character_bloodelf_female"],
    ["BloodElf", "Male", "achievement_character_bloodelf_male"],
    ["NightElf", "Female", "inv_misc_head_elf_02"],
    ["NightElf", "Male", "race_night_elf"],
  ])("maps %s %s to its available icon", (race, gender, icon) => {
    expect(getRaceIconUrl(race, gender, ICON_BASE_URL)).toBe(`${ICON_BASE_URL}/${icon}.webp`);
  });

  it("keeps the conventional race icon naming for other races", () => {
    expect(getRaceIconUrl("Human", "Male", ICON_BASE_URL)).toBe(
      `${ICON_BASE_URL}/race_human.webp`,
    );
    expect(getRaceIconUrl("Human", "Female", ICON_BASE_URL)).toBe(
      `${ICON_BASE_URL}/inv_misc_head_human_02.webp`,
    );
  });
});
