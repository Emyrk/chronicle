import { describe, expect, it, vi } from "vitest";
import type { CachedStream } from "@/hooks/instanceEvents";
import type { PanelContext } from "../types";

// The processor feeds a damage total through beforeEvent; the meter rows are that total.
vi.mock("../mainThreadProcessor", () => ({
  processIncrementally: vi.fn(async ({ beforeEvent }: { beforeEvent: (ms: number, state: { total: number }) => void }) => {
    const state = { total: 0 };
    // Events at 0.2 s, 0.5 s (on a step boundary), 1.3 s and 1.4 s after a pull at 10 s.
    for (const [ms, amount] of [[10_200, 1], [10_500, 2], [11_300, 4], [11_400, 8]]) {
      beforeEvent(ms, state);
      state.total += amount;
    }
    return { result: state, processedCount: 4, processingTimeMs: 0, lastTimestamp: null, eventsAtLastTimestamp: 0, isDone: true, unitState: null };
  }),
}));
vi.mock("../DamageDone/aggregateDamageDone", () => ({
  aggregateForEncounters: (_source: string, state: { total: number }) => [{ playerID: "p", playerName: "P", className: "mage", specialization: "", value: state.total }],
}));

const { createVideoDamageMeter } = await import("./videoMeter");

const context = {
  instance: { id: "i", players: {}, units: {}, capabilities: [] },
  selectedEncounterIds: ["e"],
  entitySelection: { playerIds: new Set<string>(), enemyIds: new Set<string>() },
} as unknown as PanelContext;
const fetchStream = async () => ({ data: new Uint8Array() }) as unknown as CachedStream;

describe("createVideoDamageMeter", () => {
  it("snapshots the meter at each step with the events up to it", async () => {
    // A 2 s fight: steps at 0, 0.5, 1, 1.5 and 2 s.
    const meterAt = await createVideoDamageMeter(context, fetchStream, 10_000, 12_000);
    const totalAt = (ms: number) => meterAt(ms).rows[0].value;
    expect(totalAt(10_000)).toBe(0);
    expect(totalAt(10_499)).toBe(0);
    // An event exactly on the boundary counts, as the live meter's stopAt does.
    expect(totalAt(10_500)).toBe(3);
    expect(totalAt(11_499)).toBe(3);
    expect(totalAt(11_500)).toBe(15);
    expect(meterAt(11_500).elapsedMs).toBe(1500);
    // Times outside the fight clamp to its first and last steps.
    expect(totalAt(9_000)).toBe(0);
    expect(totalAt(20_000)).toBe(15);
    expect(meterAt(20_000).elapsedMs).toBe(2000);
  });
});
