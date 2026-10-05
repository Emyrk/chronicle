import { describe, expect, it } from "vitest";
import { getInstanceLootFilters } from "./lootFilters";

describe("getInstanceLootFilters", () => {
  it("includes Badge of Justice in the default currency filter", () => {
    const currency = getInstanceLootFilters("Karazhan").find(
      (filter) => filter.label === "Currency",
    );

    expect(currency?.itemIds.has(29434)).toBe(true);
  });
});
