import { describe, expect, it } from "vitest";
import type { RawDebugEvent } from "./processors";
import { appendAllActivityCsvPage, createAllActivityCsv, type AllActivityCsvExportState } from "./allActivityCsv";

function activityEvent(index: number, overrides: Partial<RawDebugEvent> = {}): RawDebugEvent {
  return {
    index,
    offsetMilli: index * 100,
    dateMilli: Date.UTC(2026, 7, 10, 12, 30, 0, index),
    encounterID: "encounter",
    streamType: "damage",
    caster: "source-guid",
    casterName: "Source",
    sourceName: "Strike",
    target: "target-guid",
    targetName: "Target",
    amount: 100,
    isSynthetic: false,
    ...overrides,
  };
}

describe("All Activity CSV export", () => {
  it("appends every page in page order while sorting each page like the panel", () => {
    let state: AllActivityCsvExportState = { page: 1, totalPages: 3, events: [] };

    state = appendAllActivityCsvPage(state, [activityEvent(2), activityEvent(1)]);
    state = appendAllActivityCsvPage(state, [activityEvent(4), activityEvent(3)]);
    state = appendAllActivityCsvPage(state, [activityEvent(6), activityEvent(5)]);

    expect(state.page).toBe(3);
    expect(state.events.map((event) => event.index)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("exports display fields and escapes CSV-sensitive values", () => {
    const csv = createAllActivityCsv([
      activityEvent(1, {
        casterName: 'Source, "One"',
        sourceName: "Strike\nRank 2",
        flags: ["CRIT", "OVERKILL"],
        activityEvents: [{ type: "start", name: "Target", guid: "target-guid" }],
      }),
    ], { useRelativeTime: true, useLocalTime: false });

    const [header, row] = csv.split("\n", 2);
    expect(header).toContain("Action / Ability");
    expect(row).toContain('"Source, ""One"""');
    expect(csv).toContain('"Strike\nRank 2"');
    expect(csv).toContain("+0:00.1");
    expect(csv).toContain("CRIT | OVERKILL");
    expect(csv).toContain("start: Target (target-guid)");
  });
});
