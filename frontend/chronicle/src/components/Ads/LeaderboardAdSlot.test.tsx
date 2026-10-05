import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { LeaderboardAdSlot } from "./LeaderboardAdSlot"
import { isLocalAdPreviewHost, shouldShowCompactEncounterAd } from "./adPreview"

describe("LeaderboardAdSlot", () => {
  it("renders the vertical rail preview on localhost", () => {
    const markup = renderToStaticMarkup(<LeaderboardAdSlot variant="rail" hostname="localhost" />)

    expect(markup).toContain("Advertisement")
    expect(markup).toContain("160 × 600")
    expect(markup).toContain("2xl:block")
    expect(markup).toContain('aria-label="Advertisement preview"')
  })

  it("renders the compact desktop fallback", () => {
    const markup = renderToStaticMarkup(<LeaderboardAdSlot variant="compact" hostname="127.0.0.1" />)

    expect(markup).toContain("responsive")
    expect(markup).toContain("lg:block")
    expect(markup).toContain("2xl:hidden")
  })

  it("does not render outside local development", () => {
    expect(renderToStaticMarkup(<LeaderboardAdSlot variant="rail" hostname="turtle.chronicleclassic.com" />)).toBe("")
  })

  it("recognizes supported local hosts", () => {
    expect(isLocalAdPreviewHost("localhost")).toBe(true)
    expect(isLocalAdPreviewHost("127.0.0.1")).toBe(true)
    expect(isLocalAdPreviewHost("chronicleclassic.com")).toBe(false)
  })

  it("uses the compact slot only for short encounter lists", () => {
    expect(shouldShowCompactEncounterAd(0)).toBe(false)
    expect(shouldShowCompactEncounterAd(8)).toBe(true)
    expect(shouldShowCompactEncounterAd(9)).toBe(false)
  })
})
