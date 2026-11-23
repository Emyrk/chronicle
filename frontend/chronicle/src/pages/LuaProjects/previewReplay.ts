/** Start and end of the selected encounters in log epoch ms. */
export type ReplayBounds = { startMs: number; endMs: number }

export const REPLAY_SPEEDS = [0.5, 1, 2, 4, 8] as const

export interface PreviewReplayState {
  /** The playhead in log epoch ms; null while Replay is off. */
  playheadMs: number | null
  playing: boolean
  speed: number
}

/** One control_preview_replay call. Fields apply in this order: enabled, speed, position, playing. */
export type ReplayControl = { enabled?: boolean; speed?: number; positionMs?: number; playing?: boolean }

/** Applies a control the way the Replay controls would, clamping the playhead to the selection. */
export function applyReplayControl(state: PreviewReplayState, bounds: ReplayBounds, control: ReplayControl): PreviewReplayState {
  let next = { ...state }
  // Enabling an enabled replay keeps its position.
  if (control.enabled !== undefined && control.enabled !== (next.playheadMs !== null)) {
    next = { ...next, playing: false, playheadMs: control.enabled ? bounds.startMs : null }
  }
  if (control.speed !== undefined) next.speed = control.speed
  if (next.playheadMs === null) return { ...next, playing: false }
  if (control.positionMs !== undefined) next.playheadMs = Math.min(bounds.endMs, Math.max(bounds.startMs, bounds.startMs + control.positionMs))
  if (control.playing !== undefined) {
    // Playing from the end starts over, like the play button.
    if (control.playing && control.positionMs === undefined && next.playheadMs >= bounds.endMs) next.playheadMs = bounds.startMs
    next.playing = control.playing && next.playheadMs < bounds.endMs
  }
  return next
}

/** The tool result's view of the replay, in ms after the selection starts. */
export function replayStatus(state: PreviewReplayState, bounds: ReplayBounds) {
  return {
    enabled: state.playheadMs !== null,
    playing: state.playing,
    position_ms: state.playheadMs === null ? null : Math.round(state.playheadMs - bounds.startMs),
    duration_ms: bounds.endMs - bounds.startMs,
    speed: state.speed,
  }
}

/** Validates control_preview_replay arguments like the server. */
export function parseReplayControlArgs(value: unknown): ReplayControl {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid control_preview_replay arguments.")
  const input = value as Record<string, unknown>
  if (Object.keys(input).some(key => !["enabled", "playing", "position_ms", "speed"].includes(key))) throw new Error("control_preview_replay only accepts enabled, playing, position_ms and speed.")
  const control: ReplayControl = {}
  for (const key of ["enabled", "playing"] as const) {
    if (input[key] === undefined) continue
    if (typeof input[key] !== "boolean") throw new Error(`${key} must be true or false.`)
    control[key] = input[key]
  }
  if (input.position_ms !== undefined) {
    if (typeof input.position_ms !== "number" || !Number.isFinite(input.position_ms) || input.position_ms < 0) throw new Error("position_ms must be a non-negative number of milliseconds.")
    control.positionMs = input.position_ms
  }
  if (input.speed !== undefined) {
    if (!REPLAY_SPEEDS.includes(input.speed as never)) throw new Error(`speed must be one of ${REPLAY_SPEEDS.join(", ")}.`)
    control.speed = input.speed as number
  }
  return control
}
