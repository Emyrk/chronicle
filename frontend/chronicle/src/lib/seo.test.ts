import { describe, expect, it } from "vitest";
import { seoProductName } from "./seo";

describe("seoProductName", () => {
  it.each([
    [["vanilla", "wow-forever"], "WoW Forever"],
    [["vanilla", "kronos"], "Kronos"],
    [["wrath", "azerothcore", "chromiecraft"], "ChromieCraft"],
    [["wrath", "warmane"], "Warmane"],
    [["vanilla", "vanillaplus"], "VanillaPlus"],
    [["vanilla", "octowow"], "OctoWoW"],
    [["vanilla", "capybara"], "CapybaraCraft"],
    [["vanilla", "ravencraft"], "Ravencraft"],
    [["vanilla", "sunreach"], "Sun Reach"],
  ])("maps %j to %s", (flavor, expected) => {
    expect(seoProductName(flavor)).toBe(expected);
  });

  it("keeps unsupported flavors on generic SEO copy", () => {
    expect(seoProductName(["vanilla", "turtle"])).toBe("");
    expect(seoProductName(undefined)).toBe("");
  });
});
