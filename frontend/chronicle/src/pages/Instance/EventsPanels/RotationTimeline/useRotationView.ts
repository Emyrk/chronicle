import { useCallback, useMemo, useState } from "react";
import type { AlignMode } from "./derive";

export const MIN_WINDOW_MS = 4000;
/** Visible span when replay starts from a fully zoomed-out view. */
export const REPLAY_WINDOW_MS = 30_000;
/** Where the "now" line sits in replay, as a fraction of the visible span. */
export const REPLAY_NOW_FRACTION = 0.3;

export interface RotationViewState {
  /** Visible window in aligned time. */
  startMs: number;
  endMs: number;
  align: AlignMode;
  ignored: ReadonlySet<number>;
  /** Aligned time under the pointer, synced across every lane. */
  cursorMs: number | null;
  /**
   * Replay time (ms since encounter start), or null outside replay. In replay
   * the window follows it: casts scroll left past a fixed "now" line.
   */
  nowMs: number | null;
  /** Where the shared yellow indicator sits: replay time while replaying, else the pointer. */
  indicatorMs: number | null;
}

export interface RotationView extends RotationViewState {
  durationMs: number;
  setWindow: (startMs: number, endMs: number) => void;
  zoom: (factor: number) => void;
  fit: () => void;
  setAlign: (align: AlignMode) => void;
  toggleIgnored: (spellId: number) => void;
  setCursorMs: (ms: number | null) => void;
}

function clampWindow(startMs: number, endMs: number, durationMs: number): [number, number] {
  const span = Math.min(durationMs, Math.max(MIN_WINDOW_MS, endMs - startMs));
  const start = Math.min(Math.max(0, startMs), Math.max(0, durationMs - span));
  return [start, start + span];
}

/**
 * Interaction state for a rotation timeline. Owned by whoever renders the
 * timeline (the Player Timeline page today, a trimmed panel later).
 */
export function useRotationView(
  durationMs: number,
  nowMs: number | null = null,
  initialIgnored: readonly number[] = [],
): RotationView {
  // The window resets when the encounter (its duration) changes.
  const [rangeState, setRangeState] = useState<{ durationMs: number; range: [number, number] }>({
    durationMs,
    range: [0, durationMs],
  });
  const userStart = rangeState.durationMs === durationMs ? rangeState.range[0] : 0;
  const userEnd = rangeState.durationMs === durationMs ? rangeState.range[1] : durationMs;
  // Replay keeps the user's zoom (span) but centers on now; it ignores pan.
  const replaySpan = userEnd - userStart >= durationMs ? Math.min(REPLAY_WINDOW_MS, durationMs) : userEnd - userStart;
  const startMs = nowMs != null ? nowMs - replaySpan * REPLAY_NOW_FRACTION : userStart;
  const endMs = nowMs != null ? startMs + replaySpan : userEnd;
  const [alignState, setAlign] = useState<AlignMode>("pull");
  // Replay time is pull time, so per-player alignment does not apply.
  const align: AlignMode = nowMs != null ? "pull" : alignState;
  const [ignored, setIgnored] = useState<ReadonlySet<number>>(() => new Set(initialIgnored));
  const [cursorMs, setCursorMs] = useState<number | null>(null);

  const setRange = useCallback(
    (update: (current: [number, number]) => [number, number]) =>
      setRangeState((prev) => ({
        durationMs,
        range: update(prev.durationMs === durationMs ? prev.range : [0, durationMs]),
      })),
    [durationMs],
  );

  const setWindow = useCallback(
    (startMs: number, endMs: number) => setRange(() => clampWindow(startMs, endMs, durationMs)),
    [durationMs, setRange],
  );

  const zoom = useCallback(
    (factor: number) =>
      setRange(([s, e]) => {
        const center = (s + e) / 2;
        const span = (e - s) * factor;
        return clampWindow(center - span / 2, center + span / 2, durationMs);
      }),
    [durationMs, setRange],
  );

  const fit = useCallback(() => setRange(() => [0, durationMs]), [durationMs, setRange]);

  const toggleIgnored = useCallback((spellId: number) => {
    setIgnored((prev) => {
      const next = new Set(prev);
      if (next.has(spellId)) next.delete(spellId);
      else next.add(spellId);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      startMs,
      endMs,
      align,
      ignored,
      cursorMs,
      nowMs,
      indicatorMs: nowMs ?? cursorMs,
      durationMs,
      setWindow,
      zoom,
      fit,
      setAlign,
      toggleIgnored,
      setCursorMs,
    }),
    [startMs, endMs, align, ignored, cursorMs, nowMs, durationMs, setWindow, zoom, fit, toggleIgnored],
  );
}
