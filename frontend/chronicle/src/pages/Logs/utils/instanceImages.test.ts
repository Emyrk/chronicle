import { describe, expect, it } from "vitest";
import { getInstanceCategory } from "./instanceImages";

describe("getInstanceCategory", () => {
  it("classifies Scarlet Monastery as a raid for VanillaPlus", () => {
    expect(getInstanceCategory("Scarlet Monastery", ["vanilla", "vanillaplus"])).toBe("raid");
  });

  it("keeps Scarlet Monastery as a dungeon for other flavors", () => {
    expect(getInstanceCategory("Scarlet Monastery", ["vanilla", "turtle"])).toBe("dungeon");
  });
});
