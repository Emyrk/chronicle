import { describe, expect, it } from "vitest";
import { hasDeathLogEvents, isDeathAheadOfSyncCursor } from "./deathLogSync";
import { createDeathsProcessor, type DeathEvent } from "./deaths.processor";

describe("Death Log Sync display", () => {
  it("reports whether a result has any deaths", () => {
    const empty = createDeathsProcessor().createState();
    expect(hasDeathLogEvents(empty)).toBe(false);

    const withDeath = createDeathsProcessor().createState();
    withDeath.DeathEvents = [{ dateMilli: 1_000 } as DeathEvent];
    expect(hasDeathLogEvents(withDeath)).toBe(true);
  });

  it("marks only deaths after the Sync timestamp as pending", () => {
    const death = { dateMilli: 10_000 } as DeathEvent;

    expect(isDeathAheadOfSyncCursor(death, true, new Date(9_999))).toBe(true);
    expect(isDeathAheadOfSyncCursor(death, true, new Date(10_000))).toBe(false);
    expect(isDeathAheadOfSyncCursor(death, false, new Date(9_999))).toBe(false);
    expect(isDeathAheadOfSyncCursor(death, true, null)).toBe(false);
  });
});
