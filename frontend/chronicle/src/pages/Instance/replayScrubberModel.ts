/**
 * The replay scrubbers' shared model (pure, tested): time to track position
 * and back over a clock's bounds, pointer-drag and keyboard seeking, ARIA
 * values, and marker placement. Every scrubber (the mini map's, the page's
 * Replay bar and overlay, the Replay strip, the landing hero's) renders
 * through `ReplayScrubber`, which uses this.
 */

import type { ReplayBounds, ReplayClock } from "./EventsPanels/Map/replayClock";

/** The playback speeds the page's Replay offers (the overlay, its bar and the Replay strip). */
export const REPLAY_SPEEDS = [0.25, 0.5, 1, 2, 4] as const;

/** What a scrubber reads and drives: a ReplayClock, or a view of one. */
export type ScrubberSource = Pick<ReplayClock, "nowMs" | "bounds" | "seek">;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Where `ms` sits on the track, 0–1; 0 without a time, without bounds, or for an empty span. */
export function fractionAt(ms: number | null, bounds: ReplayBounds | null): number {
  if (ms === null || !bounds) return 0;
  const durationMs = bounds.endMs - bounds.startMs;
  return durationMs > 0 ? clamp01((ms - bounds.startMs) / durationMs) : 0;
}

/** The replay time at a track fraction (clamped to the track). */
export function timeAtFraction(fraction: number, bounds: ReplayBounds): number {
  return bounds.startMs + clamp01(fraction) * (bounds.endMs - bounds.startMs);
}

/** The track fraction under a pointer, clamped, so a drag past either end holds the end. */
export function pointerFraction(clientX: number, rect: { left: number; width: number }): number {
  return rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0;
}

export type ScrubPhase = "start" | "move" | "end";

export type ScrubPointerEvent =
  | { type: "down"; clientX: number; rect: { left: number; width: number }; button: number }
  | { type: "move"; clientX: number; rect: { left: number; width: number } }
  | { type: "up"; clientX: number; rect: { left: number; width: number } }
  | { type: "cancel" };

/**
 * One pointer event on a scrubber track. A primary-button press starts a drag
 * (unless disabled); moves scrub only while dragging, wherever the pointer is;
 * release ends it at the pointer; cancel ends it without a seek.
 */
export function scrubDrag(
  dragging: boolean,
  event: ScrubPointerEvent,
  disabled = false,
): { dragging: boolean; scrub: { phase: ScrubPhase; fraction: number } | null } {
  switch (event.type) {
    case "down":
      if (disabled || event.button !== 0) return { dragging, scrub: null };
      return { dragging: true, scrub: { phase: "start", fraction: pointerFraction(event.clientX, event.rect) } };
    case "move":
      return dragging
        ? { dragging: true, scrub: { phase: "move", fraction: pointerFraction(event.clientX, event.rect) } }
        : { dragging: false, scrub: null };
    case "up":
      return dragging
        ? { dragging: false, scrub: { phase: "end", fraction: pointerFraction(event.clientX, event.rect) } }
        : { dragging: false, scrub: null };
    case "cancel":
      return { dragging: false, scrub: null };
  }
}

export interface ScrubKeyOptions {
  /** How far an arrow key moves, in replay ms. */
  stepMs: number;
  /** Home and End go to the track's ends. */
  homeEnd?: boolean;
  /** Up and Down step as Right and Left do. */
  vertical?: boolean;
  /** Page Up and Page Down move this fraction of the track; unset ignores them. */
  pageFraction?: number;
}

/** The replay time a key press seeks to (clamped to the track), or null when the key does not seek. */
export function scrubKeyTarget(key: string, nowMs: number, bounds: ReplayBounds, options: ScrubKeyOptions): number | null {
  const { stepMs, homeEnd = true, vertical = true, pageFraction } = options;
  const pageMs = pageFraction ? pageFraction * (bounds.endMs - bounds.startMs) : null;
  let target: number | null = null;
  if (key === "ArrowLeft" || (vertical && key === "ArrowDown")) target = nowMs - stepMs;
  else if (key === "ArrowRight" || (vertical && key === "ArrowUp")) target = nowMs + stepMs;
  else if (homeEnd && key === "Home") target = bounds.startMs;
  else if (homeEnd && key === "End") target = bounds.endMs;
  else if (pageMs !== null && key === "PageDown") target = nowMs - pageMs;
  else if (pageMs !== null && key === "PageUp") target = nowMs + pageMs;
  return target === null ? null : Math.min(bounds.endMs, Math.max(bounds.startMs, target));
}

export interface ScrubAria {
  valueMin: number;
  valueMax: number;
  valueNow: number;
}

/**
 * A track slider's ARIA values: as a percentage (the mini map), or as elapsed
 * whole seconds (the strip rounds, the landing floors).
 */
export function scrubAria(nowMs: number | null, bounds: ReplayBounds | null, unit: "percent" | "seconds", round: (value: number) => number = Math.round): ScrubAria {
  if (unit === "percent") return { valueMin: 0, valueMax: 100, valueNow: round(fractionAt(nowMs, bounds) * 100) };
  const durationMs = bounds ? Math.max(0, bounds.endMs - bounds.startMs) : 0;
  const elapsedMs = bounds && nowMs !== null ? Math.min(durationMs, Math.max(0, nowMs - bounds.startMs)) : 0;
  return { valueMin: 0, valueMax: round(durationMs / 1000), valueNow: round(elapsedMs / 1000) };
}

/** A marker's position on the track, as a percentage (unclamped; 0 for an empty span). */
export function markerPercent(atMs: number, bounds: ReplayBounds): number {
  const durationMs = bounds.endMs - bounds.startMs;
  return durationMs > 0 ? ((atMs - bounds.startMs) / durationMs) * 100 : 0;
}

export interface PlacedDeathMarker<T> {
  death: T;
  atMs: number;
  /** Position along the track, 0–100. */
  left: number;
  /** At or before the cursor (always, without one). */
  past: boolean;
}

/**
 * The one placement of player-death markers on a scrubber, in the deaths'
 * given order. `outside`: `"drop"` leaves out deaths outside the bounds (the
 * page's Replay bar, overlay and strip); `"clamp"` pins them to the nearer end
 * (the landing hero). Which deaths count is the caller's source, not this.
 */
export function deathMarkers<T>(
  deaths: readonly T[],
  timeOf: (death: T) => number,
  bounds: ReplayBounds,
  options: { outside: "drop" | "clamp"; cursorMs?: number | null },
): PlacedDeathMarker<T>[] {
  const cursorMs = options.cursorMs ?? null;
  if (bounds.endMs - bounds.startMs <= 0 && options.outside === "drop") return [];
  return deaths.flatMap((death) => {
    const atMs = timeOf(death);
    const inBounds = atMs >= bounds.startMs && atMs <= bounds.endMs;
    if (!inBounds && options.outside === "drop") return [];
    const percent = markerPercent(atMs, bounds);
    return [{ death, atMs, left: options.outside === "clamp" ? Math.min(100, Math.max(0, percent)) : percent, past: cursorMs === null || atMs <= cursorMs }];
  });
}
