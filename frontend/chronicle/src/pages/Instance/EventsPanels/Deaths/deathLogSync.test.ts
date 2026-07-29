import { describe, expect, it } from "vitest";
import {
  deathLogDataContextKey,
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
    const snapshot: DeathLogSnapshot = { dataContextKey: "4", result: complete };

    expect(selectDeathLogDisplayResult(incremental, snapshot, "4")).toBe(complete);
  });

  it("keeps the same data key when only the display window changes", () => {
    const option45 = "m:players,w:45";
    const option60 = "m:players,w:60";
    const version45 = `0|instance|encounters|||${option45}|0`;
    const version60 = `0|instance|encounters|||${option60}|0`;

    const key45 = deathLogDataContextKey(version45, option45);
    const key60 = deathLogDataContextKey(version60, option60);
    expect(key45).toBe(key60);

    const complete = resultWithDeaths(3);
    const empty = resultWithDeaths(0);
    const snapshot: DeathLogSnapshot = { dataContextKey: key45, result: complete };
    expect(selectDeathLogDisplayResult(empty, snapshot, key60)).toBe(complete);
  });

  it("keeps the same data key when switching player/enemy display mode", () => {
    const players = "m:players,w:60";
    const enemies = "m:enemies,w:60";
    const playersVersion = `0|instance|encounters|||${players}|0`;
    const enemiesVersion = `0|instance|encounters|||${enemies}|0`;

    expect(deathLogDataContextKey(playersVersion, players)).toBe(
      deathLogDataContextKey(enemiesVersion, enemies),
    );
  });

  it("does not reuse a snapshot from a different panel context", () => {
    const complete = resultWithDeaths(3);
    const incremental = resultWithDeaths(1);
    const snapshot: DeathLogSnapshot = { dataContextKey: "3", result: complete };

    expect(selectDeathLogDisplayResult(incremental, snapshot, "4")).toBe(incremental);
    expect(selectDeathLogDisplayResult(incremental, snapshot, "3")).toBe(complete);
  });

  it("marks only deaths after the Sync timestamp as pending", () => {
    const death = { dateMilli: 10_000 } as DeathEvent;

    expect(isDeathAheadOfSyncCursor(death, true, new Date(9_999))).toBe(true);
    expect(isDeathAheadOfSyncCursor(death, true, new Date(10_000))).toBe(false);
    expect(isDeathAheadOfSyncCursor(death, false, new Date(9_999))).toBe(false);
  });
});
