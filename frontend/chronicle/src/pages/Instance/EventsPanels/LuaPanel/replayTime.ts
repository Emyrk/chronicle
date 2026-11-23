import { useEffect, useRef, useState } from "react"
import type { PanelReplayTime } from "./LuaPanelHost"

/** Shown instead of a module that does not declare `replay` while Replay is on. */
export const REPLAY_DISABLED_MESSAGE = "This panel did not opt into replay mode, and is disabled."

/** Matches built-in panels: playback updates reach a module at most this often. */
export const REPLAY_THROTTLE_MS = 100

/**
 * The Replay playhead for a Lua panel, throttled like built-in panels during playback. `timestampMs` is the
 * playhead in log epoch ms and `startMs` the selected encounters' start; null when Replay is off.
 */
export function useThrottledReplayTime(timestampMs: number | null, startMs: number | null): PanelReplayTime | null {
  const target = timestampMs === null || startMs === null ? null : { ms: Math.max(0, Math.round(timestampMs - startMs)), untilMs: timestampMs }
  const [shown, setShown] = useState<PanelReplayTime | null>(target)
  const lastSent = useRef(0)
  const targetMs = target?.ms ?? null
  const targetUntil = target?.untilMs ?? null
  useEffect(() => {
    const next = targetMs === null || targetUntil === null ? null : { ms: targetMs, untilMs: targetUntil }
    // Turning Replay on or off applies at once; playhead moves are throttled, with the latest one kept.
    const wait = next === null ? 0 : Math.max(0, lastSent.current + REPLAY_THROTTLE_MS - performance.now())
    const apply = () => { lastSent.current = performance.now(); setShown(next) }
    if (wait === 0) { apply(); return }
    const timer = setTimeout(apply, wait)
    return () => clearTimeout(timer)
  }, [targetMs, targetUntil])
  return shown
}

/**
 * What an incremental replay does when the playhead moves to `untilMs`: resume past what it has delivered, arm the
 * restart timer, keep a pending restart waiting, or only update the replay time. Only moving further back re-arms
 * the timer, so pressing play after scrubbing back still restarts once the debounce ends.
 */
export function incrementalReplayStep(untilMs: number, previousUntilMs: number | null, sentUntilMs: number, restartPending: boolean): "resume" | "arm" | "wait" | "time" {
  if (untilMs > sentUntilMs) return "resume"
  if (untilMs === sentUntilMs) return "time"
  return !restartPending || (previousUntilMs !== null && untilMs < previousUntilMs) ? "arm" : "wait"
}
