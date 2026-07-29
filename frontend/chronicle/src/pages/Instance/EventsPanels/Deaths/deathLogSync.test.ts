import { describe, expect, it } from "vitest";
import {
  isDeathAheadOfSyncCursor,
  selectDeathLogDisplayResult,
  type DeathLogSnapshot,
} from "./deathLogSync";
import { createDeathsProcessor, type DeathEvent, type DeathsResult } from "./deaths.processor";

function resultWithDeaths(count: number): DeathsResult {
  const result = createDeathsProcessor().createState();
  result.DeathEvents = Array.from({ length: count }, (_, index) => ({
    dateMilli: 1_000 + index,
  })) as DeathEvent[];
  return result;
}

describe("Death Log Sync display", () => {
  it("keeps the complete encounter snapshot while Sync advances", () => {
    const complete = resultWithDeaths(3);
    const incremental = resultWithDeaths(1);
    const snapshot: DeathLogSnapshot = { panelContextVersion: "4", result: complete };

    expect(selectDeathLogDisplayResult(incremental, snapshot, true, "4")).toBe(complete);
  });

  it("does not reuse a snapshot from a different panel context", () => {
    const complete = resultWithDeaths(3);
    const incremental = resultWithDeaths(1);
    const snapshot: DeathLogSnapshot = { panelContextVersion: "3", result: complete };

    expect(selectDeathLogDisplayResult(incremental, snapshot, true, "4")).toBe(incremental);
    expect(selectDeathLogDisplayResult(incremental, snapshot, false, "3")).toBe(incremental);
  });

  it("marks only deaths after the Sync timestamp as pending", () => {
    const death = { dateMilli: 10_000 } as DeathEvent;

    expect(isDeathAheadOfSyncCursor(death, true, new Date(9_999))).toBe(true);
    expect(isDeathAheadOfSyncCursor(death, true, new Date(10_000))).toBe(false);
    expect(isDeathAheadOfSyncCursor(death, false, new Date(9_999))).toBe(false);
  });
});
