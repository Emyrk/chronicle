import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { AdSlot } from "./AdSlot"
import { isLocalAdPreviewHost, shouldShowCompactEncounterAd } from "./adPreview"

describe("AdSlot", () => {
  it("renders the vertical rail preview on localhost", () => {
    const markup = renderToStaticMarkup(
      <AdSlot placement="leaderboards-right-rail" format="rail" hostname="localhost" />,
    )

    expect(markup).toContain("Advertisement")
    expect(markup).toContain("160 × 600")
    expect(markup).toContain("2xl:block")
    expect(markup).toContain('aria-label="Advertisement preview"')
    expect(markup).toContain('data-ad-placement="leaderboards-right-rail"')
  })

  it("renders the responsive desktop format by default", () => {
    const markup = renderToStaticMarkup(
      <AdSlot placement="statistics-encounter-sidebar" hostname="127.0.0.1" />,
    )

    expect(markup).toContain("responsive")
    expect(markup).toContain("lg:block")
    expect(markup).not.toContain("2xl:hidden")
    expect(markup).toContain('data-ad-placement="statistics-encounter-sidebar"')
  })

  it("does not render outside local development", () => {
    expect(
      renderToStaticMarkup(
        <AdSlot placement="leaderboards-right-rail" format="rail" hostname="turtle.chronicleclassic.com" />,
      ),
    ).toBe("")
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
