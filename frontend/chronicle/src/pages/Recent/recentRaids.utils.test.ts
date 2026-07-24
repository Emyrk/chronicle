import { describe, it, expect } from "vitest";
import { expandInstanceOptions, expandInstanceQuery } from "./recentRaids.utils";

describe("expandInstanceOptions", () => {
  it("inserts Lower and Upper when Tower of Karazhan is present", () => {
    const result = expandInstanceOptions(["Molten Core", "Tower of Karazhan", "Zul'Gurub"]);
    expect(result).toEqual([
      "Molten Core",
      "Tower of Karazhan",
      "Lower Tower of Karazhan",
      "Upper Tower of Karazhan",
      "Zul'Gurub",
    ]);
  });

  it("returns list unchanged when parent is absent", () => {
    const input = ["Molten Core", "Zul'Gurub"];
    expect(expandInstanceOptions(input)).toEqual(input);
  });

  it("does not duplicate when Lower/Upper already present", () => {
    const result = expandInstanceOptions([
      "Lower Tower of Karazhan",
      "Tower of Karazhan",
      "Upper Tower of Karazhan",
    ]);
    expect(result).toEqual([
      "Lower Tower of Karazhan",
      "Tower of Karazhan",
      "Upper Tower of Karazhan",
    ]);
  });

  it("handles empty input", () => {
    expect(expandInstanceOptions([])).toEqual([]);
  });
});

describe("expandInstanceQuery", () => {
  it("expands Tower of Karazhan to parent + Lower + Upper", () => {
    const result = expandInstanceQuery(["Tower of Karazhan"]);
    expect(result).toEqual([
      "Tower of Karazhan",
      "Lower Tower of Karazhan",
      "Upper Tower of Karazhan",
    ]);
  });

  it("keeps Lower alone when selected individually", () => {
    expect(expandInstanceQuery(["Lower Tower of Karazhan"])).toEqual([
      "Lower Tower of Karazhan",
    ]);
  });

  it("keeps Upper alone when selected individually", () => {
    expect(expandInstanceQuery(["Upper Tower of Karazhan"])).toEqual([
      "Upper Tower of Karazhan",
    ]);
  });

  it("de-duplicates when parent and child are both selected", () => {
    const result = expandInstanceQuery([
      "Tower of Karazhan",
      "Lower Tower of Karazhan",
    ]);
    expect(result).toEqual([
      "Tower of Karazhan",
      "Lower Tower of Karazhan",
      "Upper Tower of Karazhan",
    ]);
  });

  it("passes through unrelated instances unchanged", () => {
    const result = expandInstanceQuery(["Molten Core", "Zul'Gurub"]);
    expect(result).toEqual(["Molten Core", "Zul'Gurub"]);
  });

  it("handles empty input", () => {
    expect(expandInstanceQuery([])).toEqual([]);
  });
});
