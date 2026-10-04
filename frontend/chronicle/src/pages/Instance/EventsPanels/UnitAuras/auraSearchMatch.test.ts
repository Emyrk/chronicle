import { describe, expect, it } from "vitest";
import { fuzzyAuraNameMatch } from "./auraSearchMatch";

describe("fuzzyAuraNameMatch", () => {
  it("matches case-insensitive substrings", () => {
    expect(fuzzyAuraNameMatch("word", "Power Word: Shield")).toBe(true);
  });

  it("matches ordered fuzzy characters", () => {
    expect(fuzzyAuraNameMatch("pwsh", "Power Word: Shield")).toBe(true);
  });

  it("matches multiple fuzzy terms", () => {
    expect(fuzzyAuraNameMatch("sh pow", "Power Word: Shield")).toBe(true);
  });

  it("rejects terms whose characters are out of order", () => {
    expect(fuzzyAuraNameMatch("zpw", "Power Word: Shield")).toBe(false);
  });

  it("matches every name for an empty query", () => {
    expect(fuzzyAuraNameMatch("   ", "Arcane Intellect")).toBe(true);
  });
});
