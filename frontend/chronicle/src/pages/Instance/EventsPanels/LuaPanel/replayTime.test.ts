import { describe, expect, it } from "vitest"
import { incrementalReplayStep } from "./replayTime"

describe("incrementalReplayStep", () => {
  it("resumes past what was delivered and only updates the time at it", () => {
    expect(incrementalReplayStep(95_000, 90_000, 90_000, false)).toBe("resume")
    expect(incrementalReplayStep(90_000, 89_000, 90_000, false)).toBe("time")
  })

  it("arms a restart on each move back, but playing forward behind the delivered playhead keeps waiting", () => {
    expect(incrementalReplayStep(30_000, 90_000, 90_000, false)).toBe("arm")
    expect(incrementalReplayStep(25_000, 30_000, 90_000, true)).toBe("arm")
    // Pressing play after scrubbing back must not postpone the restart on every tick.
    expect(incrementalReplayStep(25_100, 25_000, 90_000, true)).toBe("wait")
    expect(incrementalReplayStep(25_100, 25_000, 90_000, false)).toBe("arm")
  })
})
