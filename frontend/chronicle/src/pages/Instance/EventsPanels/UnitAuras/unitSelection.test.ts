import { describe, expect, it } from "vitest";
import {
  parseAuraSearchQuery,
  parseSelectedUnits,
  serializeSelectedUnits,
  serializeUnitAuraOptions,
} from "./unitSelection";

describe("Unit Auras selection persistence", () => {
  it("round-trips multiple selected units in order", () => {
    const selected = ["player-guid", "friendly-guid", "enemy-guid"];

    expect(parseSelectedUnits(serializeSelectedUnits(selected))).toEqual(selected);
  });

  it("ignores unrelated panel option tokens", () => {
    expect(parseSelectedUnits("other,u:first,flag,u:second")).toEqual(["first", "second"]);
  });

  it("round-trips the aura search query with selected units", () => {
    const option = serializeUnitAuraOptions(["player-guid"], "Power, Word: Shield [Rank 10]");

    expect(parseSelectedUnits(option)).toEqual(["player-guid"]);
    expect(parseAuraSearchQuery(option)).toBe("Power, Word: Shield [Rank 10]");
  });

  it("persists a search query without selected units", () => {
    const option = serializeUnitAuraOptions([], "fort");

    expect(option).toBe("q:fort");
    expect(parseSelectedUnits(option)).toEqual([]);
    expect(parseAuraSearchQuery(option)).toBe("fort");
  });

  it("clears the panel option when no units remain", () => {
    expect(serializeSelectedUnits([])).toBeNull();
  });
});
