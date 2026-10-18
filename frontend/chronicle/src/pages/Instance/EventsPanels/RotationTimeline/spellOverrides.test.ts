import { describe, expect, it } from "vitest";
import { activeOverrides, findOverride, type SpellOverride } from "./spellOverrides";

const overrides: SpellOverride[] = [
  { id: "a", names: ["Nature Eclipse"], spellIds: [51442], flavor: ["nightmare-of-ursol"], note: "" },
  { id: "b", names: ["Anywhere"], note: "" },
];

describe("spell overrides", () => {
  it("applies flavored overrides only to matching logs", () => {
    expect(activeOverrides(["vanilla", "nightmare-of-ursol", "turtle"], overrides).map((o) => o.id)).toEqual(["a", "b"]);
    expect(activeOverrides(["vanilla", "kronos"], overrides).map((o) => o.id)).toEqual(["b"]);
  });

  it("tracks Arcane Rupture ranks 1 through 6 on Nightmare of Ursol", () => {
    const arcaneRupture = activeOverrides(["nightmare-of-ursol"]).find((override) => override.id === "arcane-rupture");

    expect(arcaneRupture).toMatchObject({
      spellIds: [51955, 51956, 51957, 51958, 51959, 51960],
      showAsCooldown: {},
      proc: true,
      trackAura: true,
    });
    expect(activeOverrides(["turtle"]).some((override) => override.id === "arcane-rupture")).toBe(false);
  });

  it("matches by spell ID or by name, case-insensitively", () => {
    expect(findOverride(overrides, 51442, null)?.id).toBe("a");
    expect(findOverride(overrides, 1, "nature eclipse")?.id).toBe("a");
    expect(findOverride(overrides, 1, "Something else")).toBeUndefined();
  });
});
