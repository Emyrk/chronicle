import { describe, expect, it } from "vitest";
import { BOSS_MINI_SLUGS, bossMiniSlug, bossMiniUrl } from "./bossMinis";

describe("bossMinis", () => {
  it("maps each Wailing Caverns boss entry to its model file", () => {
    expect(Object.fromEntries(BOSS_MINI_SLUGS)).toEqual({
      3671: "lady-anacondra",
      3670: "lord-pythas",
      3669: "lord-cobrahn",
      3653: "kresh",
      3674: "skum",
      3673: "lord-serpentis",
      5775: "verdan-the-everliving",
      3654: "mutanus-the-devourer",
      5912: "deviate-faerie-dragon",
    });
  });

  it("returns nothing for other or missing entries", () => {
    expect(bossMiniSlug(undefined)).toBeUndefined();
    expect(bossMiniSlug(11502)).toBeUndefined();
    expect(bossMiniUrl(11502)).toBeUndefined();
  });

  it("builds model URLs under the base URL", () => {
    expect(bossMiniUrl(3654, "/boss-minis")).toBe("/boss-minis/mutanus-the-devourer.glb");
    expect(bossMiniUrl(3653, "https://cdn.example/minis/")).toBe("https://cdn.example/minis/kresh.glb");
  });
});
