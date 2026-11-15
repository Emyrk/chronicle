import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useSyncModeContextOptional } from "../../SyncModeContext";
import {
  advanceLoopOffset,
  localLoopSpeed,
  loopShape,
  normalizeLoopOffset,
  seekLoopOffset,
  steppedClockReducer,
  syncModeClock,
  type ReplayBounds,
  type ReplayClock,
} from "./replayClock";

/** The page's Replay (SyncModeContext) as a ReplayClock; empty and inert outside a SyncModeProvider. */
export function useSyncModeClock(): ReplayClock {
  const sync = useSyncModeContextOptional();
  return useMemo(() => syncModeClock(sync), [sync]);
}

export interface LocalLoopClockOptions {
  /** The span to loop over, in replay time; the clock has no time until it is known. */
  bounds: ReplayBounds | null;
  /** Skip gaps: only these spans (replay time, in order) play; time in a gap moves on to the next one. */
  playable?: readonly (readonly [number, number])[] | null;
  /** A fixed speed; without one the speed is automatic, a loop taking about `loopMs`. */
  speed?: number;
  /** The fastest the clock plays (default 32). */
  maxSpeed?: number;
  /** The automatic speed's target loop length in real ms (default 90 s). */
  loopMs?: number;
  /** Hold the clock without changing play or pause (the host is off screen, or hides the loop). */
  suspended?: boolean;
  /** Starts playing (default true). */
  initialPlaying?: boolean;
  /** Where the clock starts, in replay ms from the loop's start. */
  initialOffsetMs?: number;
  /** How often the clock ticks, in real ms (default 250); the 3D view extrapolates between ticks. */
  tickMs?: number;
  /** The most real time one tick may count (a throttled timer never leaps the replay ahead). */
  maxStepMs?: number;
  /** A seek to the very end: `"hold"` shows the last moment, `"wrap"` (default) goes back to the start. */
  seekEnd?: "hold" | "wrap";
  /** Called each time the clock reaches the loop's end and wraps. */
  onLoop?: () => void;
}

export interface LocalLoopClock extends ReplayClock {
  /** Play or pause as asked, also while suspended (`playing` is false then). */
  requestedPlaying: boolean;
  toggle: () => void;
  /** Back to the loop's start. */
  restart: () => void;
}

/**
 * The map's own clock: loops `bounds` in replay time without the page's
 * Replay. The position is kept as replay ms from the loop's start, so it keeps
 * its place while the span grows. It does not advance without bounds.
 */
export function useLocalLoopClock(options: LocalLoopClockOptions): LocalLoopClock {
  const { bounds, playable = null, suspended = false, tickMs = 250, maxStepMs = Infinity, seekEnd = "wrap" } = options;
  const [offsetMs, setOffsetMs] = useState(options.initialOffsetMs ?? 0);
  const [requestedPlaying, setRequestedPlaying] = useState(options.initialPlaying ?? true);
  const [speedOverride, setSpeedOverride] = useState<number | null>(null);
  const startMs = bounds?.startMs ?? null;
  const endMs = bounds?.endMs ?? null;
  const activeBounds = useMemo(() => startMs !== null && endMs !== null ? { startMs, endMs } : null, [endMs, startMs]);
  const shape = useMemo(() => activeBounds ? loopShape(activeBounds, playable) : null, [activeBounds, playable]);
  const speed = shape
    ? localLoopSpeed(shape.spanMs, { speed: speedOverride ?? options.speed, maxSpeed: options.maxSpeed, loopMs: options.loopMs })
    : speedOverride ?? options.speed ?? 1;
  const nowMs = activeBounds && shape ? activeBounds.startMs + normalizeLoopOffset(offsetMs, shape) : null;
  const playing = requestedPlaying && !suspended;

  // What the timer and the controls read, without restarting the timer.
  const latest = useRef({ bounds: activeBounds, shape, speed, maxStepMs, seekEnd, onLoop: options.onLoop, offsetMs });
  useEffect(() => {
    latest.current = { bounds: activeBounds, shape, speed, maxStepMs, seekEnd, onLoop: options.onLoop, offsetMs };
  });

  const running = playing && shape !== null;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const current = latest.current;
      if (!current.shape) return;
      const step = Math.min(now - last, current.maxStepMs) * current.speed;
      last = now;
      const loopShapeNow = current.shape;
      if (current.onLoop && advanceLoopOffset(current.offsetMs, step, loopShapeNow).looped) current.onLoop();
      setOffsetMs((offset) => advanceLoopOffset(offset, step, loopShapeNow).offsetMs);
    }, tickMs);
    return () => window.clearInterval(timer);
  }, [running, tickMs]);

  const seek = useCallback((ms: number) => {
    const { bounds: at, shape: loop, seekEnd: end } = latest.current;
    if (at && loop) setOffsetMs(seekLoopOffset(ms, at, loop, end));
  }, []);
  const play = useCallback(() => setRequestedPlaying(true), []);
  const pause = useCallback(() => setRequestedPlaying(false), []);
  const toggle = useCallback(() => setRequestedPlaying((current) => !current), []);
  const restart = useCallback(() => setOffsetMs(0), []);
  const setSpeed = useCallback((next: number) => setSpeedOverride(next), []);

  return { nowMs, playing, speed, bounds: activeBounds, readOnly: false, requestedPlaying, seek, play, pause, setSpeed, toggle, restart };
}

export interface SteppedClock extends ReplayClock {
  /** Moves the time by `deltaMs` (nothing before the first seek). */
  advance: (deltaMs: number) => void;
}

const noop = () => {};

/** A clock that moves only when told to (video export): never plays, speed 1, lands on exactly the ms asked. */
export function useSteppedClock(bounds: ReplayBounds | null = null): SteppedClock {
  const [state, dispatch] = useReducer(steppedClockReducer, { nowMs: null });
  const seek = useCallback((ms: number) => dispatch({ type: "seek", ms }), []);
  const advance = useCallback((deltaMs: number) => dispatch({ type: "advance", deltaMs }), []);
  return { nowMs: state.nowMs, playing: false, speed: 1, bounds, readOnly: false, seek, advance, play: noop, pause: noop, setSpeed: noop };
}
