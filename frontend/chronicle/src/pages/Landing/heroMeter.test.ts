import { describe, expect, it } from "vitest";
import { meterTotals } from "./heroMeter";

describe("meterTotals", () => {
  it("ranks players by amount with rates over the pull and shares of the total", () => {
    const totals = meterTotals([
      { name: "Healer", className: "Priest", amount: 0 },
      { name: "Second", className: "Mage", amount: 10_000 },
      { name: "First", className: "Rogue", amount: 30_000 },
    ], 20_000);
    expect(totals.total).toBe(40_000);
    expect(totals.perSecond).toBe(2_000);
    expect(totals.rows).toEqual([
      { name: "First", className: "Rogue", perSecond: 1_500, share: 0.75 },
      { name: "Second", className: "Mage", perSecond: 500, share: 0.25 },
    ]);
  });
});
