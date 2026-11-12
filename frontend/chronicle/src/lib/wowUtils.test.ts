import { describe, expect, it } from "vitest";
import { difficultyLabel, difficultySetLabel, isHeroic } from "./wowUtils";

describe("difficulty labels", () => {
  it("supports Normal, normalized Heroic, and future identifiers", () => {
    expect(difficultyLabel("")).toBe("Normal");
    expect(difficultyLabel("heroic")).toBe("Heroic");
    expect(difficultySetLabel(["", "mythic_plus"])).toBe("Normal + Mythic Plus");
    expect(difficultySetLabel(undefined)).toBe("Mixed");
    expect(isHeroic({ difficultyName: "heroic" })).toBe(true);
  });
});
