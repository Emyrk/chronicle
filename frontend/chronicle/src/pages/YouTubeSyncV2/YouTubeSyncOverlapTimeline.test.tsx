import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { YouTubeSyncOverlapTimeline } from "./YouTubeSyncOverlapTimeline"

describe("YouTubeSyncOverlapTimeline", () => {
  it("renders UTC and local endpoint labels for an inferred video range", () => {
    const markup = renderToStaticMarkup(
      <YouTubeSyncOverlapTimeline
        instanceName="Molten Core"
        raid={{
          start: Date.parse("2026-08-07T20:00:00Z"),
          end: Date.parse("2026-08-07T23:00:00Z"),
        }}
        video={{
          start: Date.parse("2026-08-07T19:30:00Z"),
          end: Date.parse("2026-08-07T23:30:00Z"),
        }}
      />
    )

    expect(markup).toContain("Video and raid overlap")
    expect(markup).toContain("Video")
    expect(markup).toContain("Raid log")
    expect(markup).toContain("UTC")
    expect(markup).toContain("local")
  })
})
