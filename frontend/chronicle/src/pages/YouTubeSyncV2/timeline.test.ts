import { describe, expect, it } from "vitest"
import { buildTimelineModel, inferVideoRange } from "./timeline"

const raid = {
  start: Date.parse("2026-08-07T20:00:00Z"),
  end: Date.parse("2026-08-07T23:00:00Z"),
}

describe("inferVideoRange", () => {
  it("anchors the video clock to the raid date and applies the server offset", () => {
    const video = inferVideoRange(
      raid,
      4 * 3600,
      { videoTimeSeconds: 3600, serverTime: "23:00:00" },
      2
    )

    expect(video).toEqual({
      start: Date.parse("2026-08-07T20:00:00Z"),
      end: Date.parse("2026-08-08T00:00:00Z"),
    })
  })

  it("keeps a large mismatch visible instead of forcing overlap", () => {
    const video = inferVideoRange(
      raid,
      2 * 3600,
      { videoTimeSeconds: 0, serverTime: "12:00:00" },
      0
    )
    const model = buildTimelineModel(raid, video!)

    expect(model.overlapMilliseconds).toBe(0)
    expect(model.gapMilliseconds).toBe(6 * 3600 * 1000)
  })
})
