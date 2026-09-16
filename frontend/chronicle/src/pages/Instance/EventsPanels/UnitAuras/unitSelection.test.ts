import { describe, expect, it } from "vitest";
import { parseSelectedUnits, serializeSelectedUnits } from "./unitSelection";

describe("Unit Auras selection persistence", () => {
  it("round-trips multiple selected units in order", () => {
    const selected = ["player-guid", "friendly-guid", "enemy-guid"];

    expect(parseSelectedUnits(serializeSelectedUnits(selected))).toEqual(selected);
  });

  it("ignores unrelated panel option tokens", () => {
    expect(parseSelectedUnits("other,u:first,flag,u:second")).toEqual(["first", "second"]);
  });

  it("clears the panel option when no units remain", () => {
    expect(serializeSelectedUnits([])).toBeNull();
  });
});
