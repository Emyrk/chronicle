import { describe, expect, it, vi } from "vitest";
import {
  advanceLoopOffset,
  localLoopSpeed,
  loopShape,
  loopSpeed,
  normalizeLoopOffset,
  seekLoopOffset,
  steppedClockReducer,
  syncModeClock,
  type SteppedClockState,
  type SyncModeClockSource,
} from "./replayClock";

/** Ticks a loop the way useLocalLoopClock's timer does: `ticks` ticks of `tickMs` real time. */
function tickLoop(offsetMs: number, ticks: number, tickMs: number, speed: number, shape: ReturnType<typeof loopShape>, maxStepMs = Infinity) {
  let offset = offsetMs;
  let loops = 0;
  for (let index = 0; index < ticks; index++) {
    const next = advanceLoopOffset(offset, Math.min(tickMs, maxStepMs) * speed, shape);
    offset = next.offsetMs;
    if (next.looped) loops++;
  }
  return { offset, loops };
}

describe("loop speed", () => {
  it("plays a loop in about 90 seconds, never slower than real time", () => {
    expect(loopSpeed(30_000)).toBe(1);
    expect(loopSpeed(6 * 60_000)).toBe(4);
    expect(loopSpeed(4 * 60 * 60_000)).toBe(32);
  });

  it("clamps to the max speed (the mobile whole run's 4x, the landing's)", () => {
    expect(loopSpeed(4 * 60 * 60_000, 4)).toBe(4);
    expect(localLoopSpeed(4 * 60 * 60_000, { maxSpeed: 4 })).toBe(4);
    // A pull at a fixed real-time speed, whatever its length.
    expect(localLoopSpeed(20 * 60_000, { speed: 1, maxSpeed: 4 })).toBe(1);
    // A chosen speed never passes the max.
    expect(localLoopSpeed(60_000, { speed: 16, maxSpeed: 4 })).toBe(4);
  });
});

describe("local loop clock (the mini map's preview)", () => {
  // A 6 minute fight at 4x, ticking every 250 ms as Map.tsx's preview did.
  const bounds = { startMs: 1_000, endMs: 1_000 + 6 * 60_000 };
  const shape = loopShape(bounds);
  const speed = loopSpeed(shape.spanMs);

  it("loops through the encounter from its start, in replay time", () => {
    expect(speed).toBe(4);
    expect(bounds.startMs + normalizeLoopOffset(0, shape)).toBe(bounds.startMs);
    // 45 s of real time is three minutes in; 90 s wraps to the start.
    expect(bounds.startMs + tickLoop(0, 180, 250, speed, shape).offset).toBe(bounds.startMs + 3 * 60_000);
    const full = tickLoop(0, 360, 250, speed, shape);
    expect(bounds.startMs + full.offset).toBe(bounds.startMs);
    expect(full.loops).toBe(1);
  });

  it("matches the old preview cursor (start + elapsed * speed % span) tick for tick", () => {
    const previewCursorMs = (elapsedMs: number) => bounds.startMs + ((elapsedMs * speed) % shape.spanMs);
    let offset = 0;
    for (let tick = 1; tick <= 1_000; tick++) {
      offset = advanceLoopOffset(offset, 250 * speed, shape).offsetMs;
      expect(bounds.startMs + offset).toBe(previewCursorMs(tick * 250));
    }
  });

  it("seeks in replay time, holding the very end short of the wrap", () => {
    expect(bounds.startMs + seekLoopOffset(bounds.startMs + 100_000, bounds, shape, "hold")).toBe(bounds.startMs + 100_000);
    expect(seekLoopOffset(0, bounds, shape, "hold")).toBe(0);
    const atEnd = bounds.startMs + seekLoopOffset(bounds.endMs + 60_000, bounds, shape, "hold");
    expect(atEnd).toBeGreaterThan(bounds.endMs - 1_000);
    expect(atEnd).toBeLessThan(bounds.endMs);
    // "wrap": the end is the loop's start.
    expect(seekLoopOffset(bounds.endMs, bounds, shape, "wrap")).toBe(0);
  });

  it("keeps its place in replay time while the span grows (the result streaming in)", () => {
    const offset = tickLoop(0, 40, 250, speed, shape).offset;
    const grown = loopShape({ startMs: bounds.startMs, endMs: bounds.endMs + 60_000 });
    expect(normalizeLoopOffset(offset, grown)).toBe(offset);
  });
});

describe("local loop clock (the landing hero)", () => {
  // The run's encounters, with gaps between them (absolute replay ms).
  const bounds = { startMs: 10_000, endMs: 70_000 };
  const shape = loopShape(bounds, [[10_000, 20_000], [30_000, 40_000], [50_000, 60_000]]);

  it("skips gaps between encounters, and loops past the last back to the first", () => {
    expect(shape.playable).toEqual([[0, 10_000], [20_000, 30_000], [40_000, 50_000]]);
    expect(normalizeLoopOffset(5_000, shape)).toBe(5_000);
    expect(normalizeLoopOffset(12_000, shape)).toBe(20_000);
    expect(normalizeLoopOffset(30_000, shape)).toBe(30_000);
    expect(normalizeLoopOffset(55_000, shape)).toBe(0);
    expect(normalizeLoopOffset(-5_000, shape)).toBe(0);
  });

  it("advances across a gap and reports reaching the end", () => {
    expect(advanceLoopOffset(9_000, 2_000, shape)).toEqual({ offsetMs: 20_000, looped: false });
    expect(advanceLoopOffset(49_000, 2_000, shape)).toEqual({ offsetMs: 0, looped: false });
    expect(advanceLoopOffset(49_000, 12_000, shape)).toEqual({ offsetMs: 1_000, looped: true });
  });

  it("plays a pull from its first sample and calls its end once per loop", () => {
    // A 30 s window whose positions start 2 s in, at real time (1x), ticks capped at 1 s.
    const window = { startMs: 0, endMs: 30_000 };
    const pull = loopShape(window, [[2_000, 30_000]]);
    expect(normalizeLoopOffset(0, pull)).toBe(2_000);
    const { offset, loops } = tickLoop(0, 112, 250, 1, pull);
    expect(loops).toBe(1);
    // 28 s to the end from 2 s, then 0 s back to 2 s: 112 ticks of 250 ms is exactly one loop, landing on 2 s.
    expect(offset).toBe(2_000);
    // A throttled tick (5 s late) counts at most 1 s.
    expect(tickLoop(2_000, 1, 5_000, 1, pull, 1_000).offset).toBe(3_000);
  });

  it("seeks a pull's window with the end wrapping to the first sample (as before)", () => {
    const window = { startMs: 0, endMs: 30_000 };
    const pull = loopShape(window, [[2_000, 30_000]]);
    expect(seekLoopOffset(30_000, window, pull, "wrap")).toBe(2_000);
    expect(seekLoopOffset(-1_000, window, pull, "wrap")).toBe(2_000);
    expect(seekLoopOffset(15_000, window, pull, "wrap")).toBe(15_000);
  });
});

describe("SyncMode clock adapter", () => {
  const source = (overrides: Partial<SyncModeClockSource> = {}): SyncModeClockSource => ({
    enabled: true,
    currentTimestamp: new Date(5_000),
    isPlaying: true,
    playbackSpeed: 2,
    encounterBounds: { start: new Date(1_000), end: new Date(9_000) },
    externalDriver: "none",
    readOnly: false,
    setTimestamp: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    setPlaybackSpeed: vi.fn(),
    ...overrides,
  });

  it("reads Replay's time, playback and bounds in replay ms", () => {
    const clock = syncModeClock(source());
    expect(clock).toMatchObject({ nowMs: 5_000, playing: true, speed: 2, bounds: { startMs: 1_000, endMs: 9_000 }, readOnly: false });
  });

  it("has no time and does not play while Replay is off", () => {
    expect(syncModeClock(source({ enabled: false })).nowMs).toBeNull();
    expect(syncModeClock(source({ enabled: false })).playing).toBe(false);
    expect(syncModeClock(source({ currentTimestamp: null })).nowMs).toBeNull();
  });

  it("passes controls straight to SyncMode, seeking in replay ms", () => {
    const sync = source();
    const clock = syncModeClock(sync);
    clock.seek(7_000);
    expect(sync.setTimestamp).toHaveBeenCalledWith(new Date(7_000));
    clock.play();
    clock.pause();
    clock.setSpeed(4);
    expect(sync.play).toHaveBeenCalledOnce();
    expect(sync.pause).toHaveBeenCalledOnce();
    expect(sync.setPlaybackSpeed).toHaveBeenCalledWith(4);
  });

  it("is read-only while a video or a live session drives Replay, or outside a provider", () => {
    expect(syncModeClock(source({ externalDriver: "youtube" })).readOnly).toBe(true);
    expect(syncModeClock(source({ readOnly: true })).readOnly).toBe(true);
    const none = syncModeClock(null);
    expect(none).toMatchObject({ nowMs: null, playing: false, speed: 1, bounds: null, readOnly: true });
    expect(() => none.seek(1)).not.toThrow();
  });
});

describe("stepped clock", () => {
  it("has no time until seeked, then lands on exactly the ms asked", () => {
    let state = steppedClockReducer({ nowMs: null }, { type: "advance", deltaMs: 33 });
    expect(state.nowMs).toBeNull();
    state = steppedClockReducer(state, { type: "seek", ms: 1_700_000_000_123 });
    expect(state.nowMs).toBe(1_700_000_000_123);
  });

  it("advances explicitly, frame by frame", () => {
    let state: SteppedClockState = { nowMs: 1_000 };
    for (let frame = 0; frame < 30; frame++) state = steppedClockReducer(state, { type: "advance", deltaMs: 33 });
    expect(state.nowMs).toBe(1_990);
  });

  it("keeps the same state for a seek to where it already is (no extra render)", () => {
    const state = { nowMs: 1_000 };
    expect(steppedClockReducer(state, { type: "seek", ms: 1_000 })).toBe(state);
  });
});
