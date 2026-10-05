import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { LeaderboardAdSlot } from "./LeaderboardAdSlot"
import { isLocalAdPreviewHost } from "./adPreview"

describe("LeaderboardAdSlot", () => {
  it("renders the preview on localhost", () => {
    const markup = renderToStaticMarkup(<LeaderboardAdSlot hostname="localhost" />)

    expect(markup).toContain("Advertisement")
    expect(markup).toContain("Leaderboard ad preview")
    expect(markup).toContain('aria-label="Advertisement preview"')
  })

  it("does not render outside local development", () => {
    expect(renderToStaticMarkup(<LeaderboardAdSlot hostname="turtle.chronicleclassic.com" />)).toBe("")
  })

  it("recognizes supported local hosts", () => {
    expect(isLocalAdPreviewHost("localhost")).toBe(true)
    expect(isLocalAdPreviewHost("127.0.0.1")).toBe(true)
    expect(isLocalAdPreviewHost("chronicleclassic.com")).toBe(false)
  })
})
