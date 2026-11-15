/**
 * The 3D replay's clock: one interface for every host, in replay time
 * (milliseconds of the log, never wall time), with three adapters:
 *
 * - SyncMode (`syncModeClock`): the page's Replay, read and driven through
 *   SyncModeContext unchanged. The map never adds behaviour to it.
 * - Local loop (`useLocalLoopClock`): the map playing on its own without
 *   turning Replay on (the mini, mobile and whole-run preview, the landing).
 * - Stepped (`useSteppedClock`): moved explicitly, frame by frame (video export).
 *
 * This module holds the type and the pure parts; the hooks are thin wrappers
 * in `useReplayClock.ts`. It must not import SyncModeContext (useMapScene
 * imports the type from here).
 */

export interface ReplayBounds {
  startMs: number;
  endMs: number;
}

export interface ReplayClock {
  /** The replay's current time in log milliseconds, or null when the clock has none (Replay off). */
  nowMs: number | null;
  /** The time is advancing. */
  playing: boolean;
  /** Replay milliseconds per real millisecond. */
  speed: number;
  /** The span the clock moves in, when it has one. */
  bounds: ReplayBounds | null;
  /** User controls should not drive this clock (another driver, such as a video or a live session, owns it). */
  readOnly: boolean;
  seek: (ms: number) => void;
  play: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
}

// ---------------------------------------------------------------------------
// SyncMode adapter

/** What the adapter reads from SyncModeContext (a structural subset, so this module need not import it). */
export interface SyncModeClockSource {
  enabled: boolean;
  currentTimestamp: Date | null;
  isPlaying: boolean;
  playbackSpeed: number;
  encounterBounds: { start: Date; end: Date } | null;
  externalDriver: string;
  readOnly: boolean;
  setTimestamp: (ts: Date | null) => void;
  play: () => void;
  pause: () => void;
  setPlaybackSpeed: (speed: number) => void;
}

const noop = () => {};

/**
 * The page's Replay as a ReplayClock. Reading only: every control is passed
 * straight to SyncModeContext, so Replay, its 100 ms tick and what the other
 * panels see do not change. Outside a SyncModeProvider the clock is empty and
 * inert. The time is null while Replay is off.
 */
export function syncModeClock(sync: SyncModeClockSource | null): ReplayClock {
  if (!sync) {
    return { nowMs: null, playing: false, speed: 1, bounds: null, readOnly: true, seek: noop, play: noop, pause: noop, setSpeed: noop };
  }
  return {
    nowMs: sync.enabled && sync.currentTimestamp ? sync.currentTimestamp.getTime() : null,
    playing: sync.enabled && sync.isPlaying,
    speed: sync.playbackSpeed,
    bounds: sync.encounterBounds
      ? { startMs: sync.encounterBounds.start.getTime(), endMs: sync.encounterBounds.end.getTime() }
      : null,
    readOnly: sync.readOnly || sync.externalDriver !== "none",
    seek: (ms) => sync.setTimestamp(new Date(ms)),
    play: sync.play,
    pause: sync.pause,
    setSpeed: sync.setPlaybackSpeed,
  };
}

// ---------------------------------------------------------------------------
// Local loop clock

/** How long one loop takes at the automatic speed, whatever the span's length. */
export const DEFAULT_LOOP_MS = 90_000;

/** The automatic speed: a loop of `spanMs` takes about `loopMs`, never slower than real time nor faster than `maxSpeed`. */
export function loopSpeed(spanMs: number, maxSpeed = 32, loopMs = DEFAULT_LOOP_MS): number {
  return Math.max(1, Math.min(maxSpeed, Math.round(spanMs / loopMs)));
}

export interface LoopShape {
  /** The loop's length (replay ms), at least 1. */
  spanMs: number;
  /**
   * The parts of the loop that play, as offsets from its start, in order.
   * Time in a gap moves on to the next part's start; past the last, back to the first.
   */
  playable?: readonly (readonly [number, number])[] | null;
}

/** The loop's span and its playable parts as offsets from its start. */
export function loopShape(bounds: ReplayBounds, playable?: readonly (readonly [number, number])[] | null): LoopShape {
  return {
    spanMs: Math.max(1, bounds.endMs - bounds.startMs),
    playable: playable?.map(([start, end]) => [start - bounds.startMs, end - bounds.startMs] as const) ?? null,
  };
}

/** Where `offsetMs` (from the loop's start) plays: wrapped into the loop, and out of any gap. */
export function normalizeLoopOffset(offsetMs: number, shape: LoopShape): number {
  const at = ((offsetMs % shape.spanMs) + shape.spanMs) % shape.spanMs;
  if (!shape.playable?.length) return at;
  for (const [start, end] of shape.playable) {
    if (at < start) return start;
    if (at <= end) return at;
  }
  return shape.playable[0][0];
}

/** One tick: `stepMs` of replay time on from `offsetMs`. `looped` when it reached the loop's end and wrapped. */
export function advanceLoopOffset(offsetMs: number, stepMs: number, shape: LoopShape): { offsetMs: number; looped: boolean } {
  const raw = normalizeLoopOffset(offsetMs, shape) + stepMs;
  return { offsetMs: normalizeLoopOffset(raw, shape), looped: raw >= shape.spanMs };
}

/**
 * The offset a seek to `ms` (replay time) lands on, clamped into the loop.
 * `"hold"`: the end stays just short of the wrap, so it shows the last moment
 * instead of jumping to the start. `"wrap"`: the end wraps to the start.
 */
export function seekLoopOffset(ms: number, bounds: ReplayBounds, shape: LoopShape, end: "hold" | "wrap"): number {
  const max = end === "hold" ? shape.spanMs * 0.999 : shape.spanMs;
  return normalizeLoopOffset(Math.min(max, Math.max(0, ms - bounds.startMs)), shape);
}

/** The local loop's speed: a chosen speed, else the automatic one; never above `maxSpeed`. */
export function localLoopSpeed(spanMs: number, options: { speed?: number | null; maxSpeed?: number; loopMs?: number }): number {
  const maxSpeed = options.maxSpeed ?? 32;
  if (options.speed != null) return Math.min(maxSpeed, options.speed);
  return loopSpeed(spanMs, maxSpeed, options.loopMs);
}

// ---------------------------------------------------------------------------
// Stepped clock

export interface SteppedClockState {
  nowMs: number | null;
}

export type SteppedClockAction = { type: "seek"; ms: number } | { type: "advance"; deltaMs: number };

/**
 * The stepped clock moves only when told to, to exactly the millisecond asked
 * (no clamping: the driver owns the time, and waits for that exact frame).
 * Advancing a clock with no time yet does nothing.
 */
export function steppedClockReducer(state: SteppedClockState, action: SteppedClockAction): SteppedClockState {
  switch (action.type) {
    case "seek":
      return state.nowMs === action.ms ? state : { nowMs: action.ms };
    case "advance":
      return state.nowMs === null || action.deltaMs === 0 ? state : { nowMs: state.nowMs + action.deltaMs };
  }
}
