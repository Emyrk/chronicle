import { describe, expect, it } from "vitest";
import { shouldShowMapUnit } from "./mapUnitVisibility";

describe("map unit visibility", () => {
  it.each([25121, 25132])("hides V+ Scarlet Monastery entry %s", (entry) => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], entry)).toBe(false);
  });

  it("keeps other V+ Scarlet Monastery units visible", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], 25122)).toBe(true);
  });

  it("does not hide matching entries outside V+ Scarlet Monastery", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", [], 25121)).toBe(true);
    expect(shouldShowMapUnit("Scarlet Monastery Armory", ["vanillaplus"], 25121)).toBe(true);
  });

  it("keeps units without entry metadata visible", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], undefined)).toBe(true);
  });

  it("reveals suppressed entries when hidden units are enabled", () => {
    expect(shouldShowMapUnit("Scarlet Monastery", ["vanillaplus"], 25121, true)).toBe(true);
  });
});
