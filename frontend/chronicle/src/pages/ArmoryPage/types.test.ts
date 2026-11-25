import { describe, expect, it } from "vitest";
import { getClassColorVar } from "./types";

describe("getClassColorVar", () => {
  it.each(["DEATH_KNIGHT", "DEATHKNIGHT", "Death Knight", "death-knight"])(
    "maps %s to the Death Knight color",
    (name) => {
      expect(getClassColorVar(name)).toBe("var(--color-class-deathknight)");
    },
  );

  it.each(["WARRIOR", "Mage", "UNKNOWN"])("preserves the color for %s", (name) => {
    expect(getClassColorVar(name)).toBe(`var(--color-class-${name.toLowerCase()})`);
  });
});
