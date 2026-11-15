import { describe, expect, it } from "vitest";
import { IncrementalEpoch } from "./incrementalEpoch";

describe("incremental publication lifetime", () => {
  it("allows superseded cursor ticks to report progress within the same context", () => {
    const epoch = new IncrementalEpoch();
    const earlierTick = epoch.capture();
    const laterTick = epoch.capture();
    expect(earlierTick()).toBe(true);
    expect(laterTick()).toBe(true);
  });

  it("rejects delayed old-context metrics and timestamps before mutation", async () => {
    const epoch = new IncrementalEpoch();
    const oldContext = epoch.capture();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const state = { timestamp: 20, metrics: 5 };
    const oldResponse = pending.then(() => {
      if (!oldContext()) return;
      state.timestamp = 999;
      state.metrics = 999;
    });
    epoch.invalidate();
    const current = epoch.capture();
    release();
    await oldResponse;
    expect(state).toEqual({ timestamp: 20, metrics: 5 });
    expect(current()).toBe(true);
  });

  it("never revives old work after A to B to A or unmount/StrictMode cleanup", () => {
    const epoch = new IncrementalEpoch();
    const a = epoch.capture();
    epoch.invalidate();
    const b = epoch.capture();
    epoch.invalidate();
    const newA = epoch.capture();
    expect(a()).toBe(false);
    expect(b()).toBe(false);
    expect(newA()).toBe(true);
    epoch.invalidate();
    expect(newA()).toBe(false);
  });
});
