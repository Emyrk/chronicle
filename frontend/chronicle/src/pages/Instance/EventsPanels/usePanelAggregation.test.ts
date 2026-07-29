import { describe, it, expect } from "vitest";
import { resolveAggregationResultForPanel, usesIncrementalSyncProcessing } from "./usePanelAggregation";

describe("resolveAggregationResultForPanel", () => {
  it("returns cached result when panel id matches", () => {
    const previous = { marker: "damage_done" };

    const result = resolveAggregationResultForPanel(
      { panelId: "damage_done", result: previous },
      "damage_done",
      () => ({ marker: "new" }),
    );

    expect(result).toBe(previous);
  });

  it("returns fresh createState result when panel id changes", () => {
    const result = resolveAggregationResultForPanel(
      { panelId: "healing_done", result: { marker: "healing" } },
      "damage_taken",
      () => ({ marker: "damage_taken" }),
    );

    expect(result).toEqual({ marker: "damage_taken" });
  });
});

describe("usesIncrementalSyncProcessing", () => {
  it("keeps incremental panels on main-thread sync processing", () => {
    expect(usesIncrementalSyncProcessing(true, undefined)).toBe(true);
    expect(usesIncrementalSyncProcessing(true, "incremental")).toBe(true);
  });

  it("keeps full-data panels in worker mode during Sync", () => {
    expect(usesIncrementalSyncProcessing(true, "full")).toBe(false);
  });

  it("never uses sync processing when Sync is disabled", () => {
    expect(usesIncrementalSyncProcessing(false, undefined)).toBe(false);
    expect(usesIncrementalSyncProcessing(false, "full")).toBe(false);
  });
});
