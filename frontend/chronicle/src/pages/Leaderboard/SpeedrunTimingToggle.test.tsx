import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { SpeedrunTimingToggle } from "./SpeedrunTimingToggle"
import { resolveSpeedrunTimingMode } from "./speedrunTimingPreference"

describe("SpeedrunTimingToggle", () => {
  it("marks the selected timing mode", () => {
    const markup = renderToStaticMarkup(<SpeedrunTimingToggle value="full" onChange={vi.fn()} />)

    expect(markup).toContain("Ranked time")
    expect(markup).toContain("Full clear")
    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('aria-pressed="true"')
  })

  it("uses the stored preference when the URL does not select a mode", () => {
    expect(resolveSpeedrunTimingMode(null, "full")).toBe("full")
    expect(resolveSpeedrunTimingMode(null, "ranked")).toBe("ranked")
    expect(resolveSpeedrunTimingMode(null, "invalid")).toBe("ranked")
  })

  it("lets an explicit URL mode override the stored preference", () => {
    expect(resolveSpeedrunTimingMode("ranked", "full")).toBe("ranked")
    expect(resolveSpeedrunTimingMode("full", "ranked")).toBe("full")
  })
})
