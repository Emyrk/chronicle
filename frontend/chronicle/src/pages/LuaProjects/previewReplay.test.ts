import { describe, expect, it } from "vitest"
import { applyReplayControl, parseReplayControlArgs, replayStatus, type PreviewReplayState } from "./previewReplay"

const bounds = { startMs: 10_000, endMs: 70_000 }
const off: PreviewReplayState = { playheadMs: null, playing: false, speed: 1 }

describe("applyReplayControl", () => {
  it("enables, seeks and plays in one call", () => {
    const next = applyReplayControl(off, bounds, { enabled: true, positionMs: 30_000, playing: true, speed: 2 })
    expect(replayStatus(next, bounds)).toEqual({ enabled: true, playing: true, position_ms: 30_000, duration_ms: 60_000, speed: 2 })
  })

  it("keeps the position when already enabled and clamps seeks to the selection", () => {
    const on = { playheadMs: 25_000, playing: true, speed: 1 }
    expect(applyReplayControl(on, bounds, { enabled: true }).playheadMs).toBe(25_000)
    expect(applyReplayControl(on, bounds, { positionMs: 999_999 }).playheadMs).toBe(70_000)
  })

  it("ignores seeks and play while off, and disabling stops playback", () => {
    expect(applyReplayControl(off, bounds, { positionMs: 5_000, playing: true })).toEqual(off)
    expect(applyReplayControl({ playheadMs: 25_000, playing: true, speed: 4 }, bounds, { enabled: false })).toEqual({ playheadMs: null, playing: false, speed: 4 })
  })

  it("plays from the start when the playhead is at the end", () => {
    expect(applyReplayControl({ playheadMs: 70_000, playing: false, speed: 1 }, bounds, { playing: true })).toEqual({ playheadMs: 10_000, playing: true, speed: 1 })
  })
})

describe("parseReplayControlArgs", () => {
  it("validates arguments like the server", () => {
    expect(parseReplayControlArgs({})).toEqual({})
    expect(parseReplayControlArgs({ enabled: true, playing: false, position_ms: 1500, speed: 0.5 })).toEqual({ enabled: true, playing: false, positionMs: 1500, speed: 0.5 })
    for (const bad of [null, [], { position_ms: -1 }, { speed: 3 }, { enabled: "yes" }, { seek: 1 }]) expect(() => parseReplayControlArgs(bad)).toThrow()
  })
})
