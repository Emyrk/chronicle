import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlignMode } from "./derive";
import type { IconSizeMode } from "./laneLayout";

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
  /** Cast icon size: auto grows icons as you zoom in. */
  iconSize: IconSizeMode;
  ignored: ReadonlySet<number>;
  /** Aligned time under the pointer, synced across every lane. */
  cursorMs: number | null;
  /**
   * Replay time (ms since encounter start), or null outside replay. In replay
   * the window follows it: casts scroll left past a fixed "now" line.
   */
  nowMs: number | null;
  /** Time the user clicked to lock the indicator, or null. Ignored while replaying. */
  pinnedMs: number | null;
  /** Where the shared yellow indicator sits: replay time, else the pin, else the pointer. */
  indicatorMs: number | null;
}

export interface RotationView extends RotationViewState {
  durationMs: number;
  setWindow: (startMs: number, endMs: number) => void;
  zoom: (factor: number) => void;
  fit: () => void;
  /** Shift the window by ms (positive = later), keeping the zoom. No-op while replaying. */
  panBy: (ms: number) => void;
  setAlign: (align: AlignMode) => void;
  setIconSize: (size: IconSizeMode) => void;
  toggleIgnored: (spellId: number) => void;
  /** source "overview" also updates what Follow centers on. */
  setCursorMs: (ms: number | null, source?: "lanes" | "overview") => void;
  /** Keep the window centered on the pin or the overview cursor. */
  follow: boolean;
  toggleFollow: () => void;
  /** Replay or Follow controls the window, so dragging to pan is off. */
  windowLocked: boolean;
  /**
   * Pin the indicator at ms (a click). Clicking within toleranceMs of the
   * current pin unpins. Scrolls the window to the pin when it is off screen.
   */
  pinAt: (ms: number, toleranceMs: number) => void;
  unpin: () => void;
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
  const [cursorMs, setCursorState] = useState<number | null>(null);
  const [pinnedMs, setPinnedMs] = useState<number | null>(null);
  const [follow, setFollow] = useState(false);
  /** Last time hovered on the overview chart; what Follow centers on. */
  const [overviewMs, setOverviewMs] = useState<number | null>(null);

  const userStart = rangeState.durationMs === durationMs ? rangeState.range[0] : 0;
  const userEnd = rangeState.durationMs === durationMs ? rangeState.range[1] : durationMs;
  const userSpan = userEnd - userStart;
  // Replay keeps the user's zoom (span) but puts now at a fixed spot; it ignores pan.
  // Follow does the same around the pin or the overview cursor, centered.
  const replaySpan = userSpan >= durationMs ? Math.min(REPLAY_WINDOW_MS, durationMs) : userSpan;
  const followMs = follow ? (pinnedMs ?? overviewMs) : null;
  let startMs = userStart;
  let endMs = userEnd;
  if (nowMs != null) {
    startMs = nowMs - replaySpan * REPLAY_NOW_FRACTION;
    endMs = startMs + replaySpan;
  } else if (followMs != null) {
    [startMs, endMs] = clampWindow(followMs - replaySpan / 2, followMs + replaySpan / 2, durationMs);
  }
  const [alignState, setAlign] = useState<AlignMode>("pull");
  // Replay time is pull time, so per-player alignment does not apply.
  const align: AlignMode = nowMs != null ? "pull" : alignState;
  const [iconSize, setIconSize] = useState<IconSizeMode>("auto");
  const [ignored, setIgnored] = useState<ReadonlySet<number>>(() => new Set(initialIgnored));

  const setCursorMs = useCallback((ms: number | null, source: "lanes" | "overview" = "lanes") => {
    setCursorState(ms);
    if (source === "overview" && ms != null) setOverviewMs(ms);
  }, []);
  const toggleFollow = useCallback(() => setFollow((f) => !f), []);

  // F toggles Follow, unless typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
      setFollow((f) => !f);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Showing the whole fight and following a point are opposites: Fit ends Follow.
  const fit = useCallback(() => {
    setFollow(false);
    setRange(() => [0, durationMs]);
  }, [durationMs, setRange]);

  const panBy = useCallback(
    (ms: number) => {
      if (nowMs != null || followMs != null) return;
      setRange(([s, e]) => clampWindow(s + ms, e + ms, durationMs));
    },
    [nowMs, followMs, durationMs, setRange],
  );

  const pinAt = useCallback(
    (ms: number, toleranceMs: number) => {
      if (nowMs != null) return;
      if (pinnedMs != null && Math.abs(ms - pinnedMs) <= toleranceMs) {
        setPinnedMs(null);
        return;
      }
      setPinnedMs(ms);
      if (ms < userStart || ms > userEnd) {
        const span = userEnd - userStart;
        setRange(() => clampWindow(ms - span / 2, ms + span / 2, durationMs));
      }
    },
    [nowMs, pinnedMs, userStart, userEnd, durationMs, setRange],
  );
  const unpin = useCallback(() => setPinnedMs(null), []);

  // Esc unpins.
  useEffect(() => {
    if (pinnedMs == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPinnedMs(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinnedMs]);

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
      iconSize,
      ignored,
      cursorMs,
      nowMs,
      follow,
      toggleFollow,
      windowLocked: nowMs != null || followMs != null,
      pinnedMs: nowMs == null ? pinnedMs : null,
      indicatorMs: nowMs ?? pinnedMs ?? cursorMs,
      durationMs,
      setWindow,
      zoom,
      fit,
      panBy,
      setAlign,
      setIconSize,
      toggleIgnored,
      setCursorMs,
      pinAt,
      unpin,
    }),
    [startMs, endMs, align, iconSize, ignored, cursorMs, pinnedMs, nowMs, follow, toggleFollow, followMs, setCursorMs, durationMs, setWindow, zoom, fit, panBy, toggleIgnored, pinAt, unpin],
  );
}
