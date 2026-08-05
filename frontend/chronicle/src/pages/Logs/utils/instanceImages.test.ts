import { describe, expect, it } from "vitest";
import { DEFAULT_INSTANCE_ACCENT, getInstanceAccentColor, getInstanceCategory } from "./instanceImages";

describe("getInstanceCategory", () => {
  it("classifies Scarlet Monastery as a raid for VanillaPlus", () => {
    expect(getInstanceCategory("Scarlet Monastery", ["vanilla", "vanillaplus"])).toBe("raid");
  });

  it("keeps Scarlet Monastery as a dungeon for other flavors", () => {
    expect(getInstanceCategory("Scarlet Monastery", ["vanilla", "turtle"])).toBe("dungeon");
  });
});

describe("getInstanceAccentColor", () => {
  it("returns the configured accent case-insensitively", () => {
    expect(getInstanceAccentColor("molten core")).toBe("#f97316");
  });

  it("returns the default accent for unknown instances", () => {
    expect(getInstanceAccentColor("Unknown Raid")).toBe(DEFAULT_INSTANCE_ACCENT);
  });
});
