import { describe, expect, it } from "vitest";
import { isStripType, STRIPS } from "./strips";

describe("strip registration", () => {
  it("recognizes replay layouts and uses the no-op replay processor", () => {
    expect(isStripType("replay")).toBe(true);
    expect(STRIPS.replay.id).toBe("replay_strip");
    expect(STRIPS.replay.streams).toEqual([]);
    expect(STRIPS.replay.supportedOrientations).toEqual(["horizontal"]);
  });

  it("reuses the Consumes Used processor for the raid consume cost strip", () => {
    expect(isStripType("consumables_cost")).toBe(true);
    expect(STRIPS.consumables_cost.id).toBe("consumables_ledger");
    expect(STRIPS.consumables_cost.streams).toEqual(["consume"]);
    expect(STRIPS.consumables_cost.supportsFiltering).toBe(true);
    expect(STRIPS.consumables_cost.supportedOrientations).toEqual(["horizontal"]);
  });
});
