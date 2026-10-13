import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import type { SiteConfig } from "@/api/typesGenerated"
import { AdSlot } from "./AdSlot"
import { clearNitroPayAds } from "./nitroPay"
import {
  isLocalAdPreviewHost,
  shouldShowAdPreview,
  shouldShowCompactEncounterAd,
} from "./adPreview"

function renderAdSlot(element: ReactNode, siteConfig?: SiteConfig) {
  const queryClient = new QueryClient()
  if (siteConfig) {
    queryClient.setQueryData(["site-config"], siteConfig)
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>,
  )
}

describe("AdSlot", () => {
  it("renders the vertical rail preview on localhost", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="leaderboards-right-rail"
        format="rail"
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("Advertisement")
    expect(markup).toContain("160 × 600")
    expect(markup).toContain("2xl:block")
    expect(markup).toContain('aria-label="Advertisement preview"')
    expect(markup).toContain('data-ad-placement="leaderboards-right-rail"')
  })

  it("renders the responsive desktop format by default", () => {
    const markup = renderAdSlot(
      <AdSlot placement="statistics-encounter-sidebar" hostname="127.0.0.1" previewEnabled />,
    )

    expect(markup).toContain("responsive")
    expect(markup).toContain("lg:block")
    expect(markup).not.toContain("2xl:hidden")
    expect(markup).toContain('data-ad-placement="statistics-encounter-sidebar"')
  })

  it("does not render outside local development", () => {
    expect(
      renderAdSlot(
        <AdSlot
          placement="leaderboards-right-rail"
          format="rail"
          hostname="legacy.chronicleclassic.com"
          previewEnabled
        />,
      ),
    ).toBe("")
  })

  it("does not render on localhost unless previews are enabled", () => {
    expect(
      renderAdSlot(
        <AdSlot
          placement="leaderboards-right-rail"
          format="rail"
          hostname="localhost"
          previewEnabled={false}
        />,
      ),
    ).toBe("")
  })

  it("renders a NitroPay container for an enabled tenant", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="leaderboards-right-rail"
        format="rail"
        hostname="turtle.chronicleclassic.com"
        previewEnabled={false}
      />,
      {
        ads_enabled: true,
        nitropay_site_id: "12345",
      } as SiteConfig,
    )

    expect(markup).toContain('aria-label="Advertisement"')
    expect(markup).toContain('data-ad-provider="nitropay"')
    expect(markup).toContain('id="nitropay-leaderboards-right-rail"')
    expect(markup).not.toContain("Ad preview")
  })

  it("does not render for a tenant with ads disabled", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="leaderboards-right-rail"
        format="rail"
        hostname="turtle.chronicleclassic.com"
        previewEnabled={false}
      />,
      {
        ads_enabled: false,
        nitropay_site_id: "12345",
      } as SiteConfig,
    )

    expect(markup).toBe("")
  })

  it("clears NitroPay placements during SPA navigation", () => {
    const first = { onNavigate: vi.fn() }
    const second = { onNavigate: vi.fn() }

    clearNitroPayAds([first, second])

    expect(first.onNavigate).toHaveBeenCalledOnce()
    expect(second.onNavigate).toHaveBeenCalledOnce()
  })

  it("recognizes supported local hosts", () => {
    expect(isLocalAdPreviewHost("localhost")).toBe(true)
    expect(isLocalAdPreviewHost("127.0.0.1")).toBe(true)
    expect(isLocalAdPreviewHost("chronicleclassic.com")).toBe(false)
  })

  it("requires both the preview flag and a local host", () => {
    expect(shouldShowAdPreview("localhost", true)).toBe(true)
    expect(shouldShowAdPreview("localhost", false)).toBe(false)
    expect(shouldShowAdPreview("chronicleclassic.com", true)).toBe(false)
  })

  it("uses the compact slot only for short encounter lists", () => {
    expect(shouldShowCompactEncounterAd(0)).toBe(false)
    expect(shouldShowCompactEncounterAd(8)).toBe(true)
    expect(shouldShowCompactEncounterAd(9)).toBe(false)
  })
})
