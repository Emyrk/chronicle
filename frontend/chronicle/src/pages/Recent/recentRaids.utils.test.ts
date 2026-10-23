import { describe, it, expect } from "vitest";
import { expandInstanceOptions, expandInstanceQuery, getRecentRaidAdInsertions } from "./recentRaids.utils";

describe("getRecentRaidAdInsertions", () => {
  it("uses the full four to eight raid range in a single-column grid", () => {
    const instanceIDs = Array.from({ length: 500 }, (_, index) => `instance-${index}`);
    const insertions = getRecentRaidAdInsertions(instanceIDs, 1);
    const gaps = insertions.map((raidCount, index) => raidCount - (insertions[index - 1] ?? 0));

    expect(new Set(gaps)).toEqual(new Set([4, 5, 6, 7, 8]));
  });

  it("keeps every ad four to eight raids after the previous ad", () => {
    const instanceIDs = Array.from({ length: 100 }, (_, index) => `instance-${index}`);

    for (const columnCount of [1, 2, 3, 4]) {
      const insertions = getRecentRaidAdInsertions(instanceIDs, columnCount);
      const gaps = insertions.map((raidCount, index) => raidCount - (insertions[index - 1] ?? 0));

      expect(insertions.length).toBeGreaterThan(0);
      expect(gaps.every((gap) => gap >= 4 && gap <= 8)).toBe(true);
    }
  });

  it("never places consecutive ads in the same grid column", () => {
    const instanceIDs = Array.from({ length: 100 }, (_, index) => `instance-${index}`);

    for (const columnCount of [2, 3, 4]) {
      const insertions = getRecentRaidAdInsertions(instanceIDs, columnCount);
      const columns = insertions.map(
        (raidCount, adIndex) => (raidCount + adIndex) % columnCount,
      );

      for (let index = 1; index < columns.length; index += 1) {
        expect(columns[index]).not.toBe(columns[index - 1]);
      }
    }
  });

  it("keeps existing ad positions stable when more raids load", () => {
    const instanceIDs = Array.from({ length: 48 }, (_, index) => `instance-${index}`);
    const firstPageInsertions = getRecentRaidAdInsertions(instanceIDs.slice(0, 24), 4);
    const allInsertions = getRecentRaidAdInsertions(instanceIDs, 4);

    expect(allInsertions.slice(0, firstPageInsertions.length)).toEqual(firstPageInsertions);
  });
});

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
