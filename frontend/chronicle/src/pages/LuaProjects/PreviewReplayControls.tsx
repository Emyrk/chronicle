import { useEffect, useState } from "react"
import { Pause, Play, SkipBack, SkipForward } from "lucide-react"

/** Start and end of the selected encounters in log epoch ms. */
export type ReplayBounds = { startMs: number; endMs: number }

const SPEEDS = [0.5, 1, 2, 4, 8] as const
const STEP_MS = 5_000

export interface PreviewReplayState {
  /** The playhead in log epoch ms; null while Replay is off. */
  playheadMs: number | null
  playing: boolean
  speed: number
}

function formatClock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

/**
 * Replay playback for the Workshop preview, like the instance page's Replay controls: play, pause, step,
 * scrub and speed over the selected encounters. Changing the selection rewinds to its start.
 */
// eslint-disable-next-line react-refresh/only-export-components -- the hook and its controls belong together
export function usePreviewReplay(bounds: ReplayBounds | null) {
  const [state, setState] = useState<PreviewReplayState>({ playheadMs: null, playing: false, speed: 1 })
  const startMs = bounds?.startMs ?? null
  const endMs = bounds?.endMs ?? null
  const [boundsKey, setBoundsKey] = useState(`${startMs}:${endMs}`)
  if (boundsKey !== `${startMs}:${endMs}`) {
    setBoundsKey(`${startMs}:${endMs}`)
    setState(current => ({ ...current, playing: false, playheadMs: current.playheadMs === null || startMs === null ? null : startMs }))
  }
  const enabled = state.playheadMs !== null && startMs !== null && endMs !== null

  useEffect(() => {
    if (!enabled || !state.playing || endMs === null) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = now - last
      last = now
      setState(current => {
        if (current.playheadMs === null) return current
        const next = Math.min(endMs, current.playheadMs + elapsed * current.speed)
        return { ...current, playheadMs: next, playing: next < endMs }
      })
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, state.playing, endMs])

  const clamp = (ms: number) => startMs === null || endMs === null ? ms : Math.min(endMs, Math.max(startMs, ms))
  return {
    state,
    bounds: startMs !== null && endMs !== null ? { startMs, endMs } : null,
    setEnabled: (on: boolean) => setState(current => ({ ...current, playing: false, playheadMs: on && startMs !== null ? startMs : null })),
    togglePlay: () => setState(current => {
      if (current.playheadMs === null || endMs === null) return current
      // Playing from the end starts over, like a video player.
      const restart = !current.playing && current.playheadMs >= endMs
      return { ...current, playing: !current.playing, playheadMs: restart && startMs !== null ? startMs : current.playheadMs }
    }),
    seek: (ms: number) => setState(current => current.playheadMs === null ? current : { ...current, playheadMs: clamp(ms) }),
    step: (deltaMs: number) => setState(current => current.playheadMs === null ? current : { ...current, playheadMs: clamp(current.playheadMs + deltaMs) }),
    setSpeed: (speed: number) => setState(current => ({ ...current, speed })),
  }
}

type PreviewReplay = ReturnType<typeof usePreviewReplay>

const iconButton = "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"

/** Play, step, scrub and speed controls for the Workshop's Replay preview. */
export function PreviewReplayControls({ replay }: { replay: PreviewReplay }) {
  const { state, bounds } = replay
  if (state.playheadMs === null || !bounds) return null
  const durationMs = bounds.endMs - bounds.startMs
  const elapsedMs = state.playheadMs - bounds.startMs
  return <div role="group" aria-label="Replay controls" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/60 px-2 py-1 text-[11px]">
    <button type="button" className={iconButton} onClick={() => replay.step(-STEP_MS)} aria-label="Back 5 seconds" title="Back 5 seconds"><SkipBack className="size-3.5" /></button>
    <button type="button" className={iconButton} onClick={replay.togglePlay} aria-label={state.playing ? "Pause" : "Play"} title={state.playing ? "Pause" : "Play"}>
      {state.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
    </button>
    <button type="button" className={iconButton} onClick={() => replay.step(STEP_MS)} aria-label="Forward 5 seconds" title="Forward 5 seconds"><SkipForward className="size-3.5" /></button>
    <input type="range" aria-label="Replay position" className="min-w-24 flex-1 accent-primary" min={0} max={Math.max(1, durationMs)} step={100}
      value={Math.round(elapsedMs)} onChange={event => replay.seek(bounds.startMs + Number(event.target.value))} />
    <span className="font-mono tabular-nums text-muted-foreground" aria-label="Replay time">{formatClock(elapsedMs)} / {formatClock(durationMs)}</span>
    <select aria-label="Playback speed" className="rounded border border-border bg-background px-1 py-0.5" value={state.speed} onChange={event => replay.setSpeed(Number(event.target.value))}>
      {SPEEDS.map(speed => <option key={speed} value={speed}>{speed}×</option>)}
    </select>
  </div>
}
