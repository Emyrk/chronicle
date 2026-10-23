import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import type { Session } from "@/api/queries"
import type { SiteConfig } from "@/api/typesGenerated"
import { describe, expect, it, vi } from "vitest"
import { AdSlot } from "./AdSlot"
import { adSizeLabel, adSizesForFormat } from "./adFormats"
import { clearNitroPayAds, nitroPayAdOptions } from "./nitroPay"
import {
  isLocalAdPreviewHost,
  shouldShowAdPreview,
  shouldShowEncounterAd,
} from "./adPreview"

function renderAdSlot(
  element: ReactNode,
  siteConfig?: SiteConfig,
  session: Pick<Session, "ads_free"> | null = { ads_free: false },
) {
  const queryClient = new QueryClient()
  queryClient.setQueryData(["session"], session)
  if (siteConfig) {
    queryClient.setQueryData(["site-config"], siteConfig)
  }

  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
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

    expect(markup).toContain(">Advertisement</div>")
    expect(markup).toContain("160 × 600")
    expect(markup).not.toContain("300 × 600")
    expect(markup).toContain("2xl:block")
    expect(markup).toContain("min-[1920px]:w-[300px]")
    expect(markup).toContain("2xl:sticky")
    expect(markup).toContain("2xl:top-20")
    expect(markup).toContain("self-start")
    expect(markup).toContain('aria-label="Advertisement preview"')
    expect(markup).toContain('data-ad-placement="leaderboards-right-rail"')
  })

  it("waits for extra viewport width when rails are paired", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="recent-left-rail"
        format="rail"
        railLayout="paired"
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("min-[2080px]:w-[300px]")
    expect(markup).not.toContain("min-[1920px]:w-[300px]")
  })

  it("offers both rail sizes only when 300px is reserved", () => {
    expect(adSizesForFormat("rail", false)).toEqual([[160, 600]])
    expect(adSizesForFormat("rail", true)).toEqual([
      [300, 600],
      [160, 600],
    ])
  })

  it("labels only the rail sizes eligible at the current width", () => {
    expect(adSizeLabel("rail", false)).toBe("160 × 600")
    expect(adSizeLabel("rail", true)).toBe("300 × 600 / 160 × 600")
    expect(adSizeLabel("responsive", false)).toBe("responsive")
  })

  it("offers only fixed sidebar sizes that fit below the placement", () => {
    expect(adSizesForFormat("sidebar", false, false, 650)).toEqual([
      [160, 600],
      [240, 400],
      [250, 250],
    ])
    expect(adSizesForFormat("sidebar", false, false, 450)).toEqual([
      [240, 400],
      [250, 250],
    ])
    expect(adSizesForFormat("sidebar", false, false, 300)).toEqual([[250, 250]])
    expect(adSizesForFormat("sidebar", false, false, 249)).toEqual([])
  })

  it("renders a 250px-wide sidebar placement with height-eligible sizes", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="statistics-encounter-sidebar"
        format="sidebar"
        availableHeight={450}
        hostname="127.0.0.1"
        previewEnabled
      />,
    )

    expect(markup).toContain("w-[250px]")
    expect(markup).toContain("min-h-[250px]")
    expect(markup).toContain("240 × 400 / 250 × 250")
    expect(markup).toContain('data-ad-placement="statistics-encounter-sidebar"')
  })

  it("renders the responsive desktop format by default", () => {
    const markup = renderAdSlot(
      <AdSlot placement="statistics-encounter-sidebar" hostname="127.0.0.1" previewEnabled />,
    )

    expect(markup).toContain("responsive")
    expect(markup).toContain("lg:block")
    expect(markup).not.toContain("2xl:sticky")
    expect(markup).not.toContain("2xl:hidden")
    expect(markup).toContain('data-ad-placement="statistics-encounter-sidebar"')
  })

  it("renders a fixed 300 by 250 card for content grids", () => {
    const markup = renderAdSlot(
      <AdSlot placement="recent-grid-card-1" format="card" hostname="localhost" previewEnabled />,
    )

    expect(adSizesForFormat("card", false)).toEqual([[300, 250]])
    expect(adSizesForFormat("card", false, true)).toEqual([[300, 100]])
    expect(adSizeLabel("card", false)).toBe("300 × 250")
    expect(adSizeLabel("card", false, true)).toBe("300 × 100")
    expect(markup).toContain("300 × 250")
    expect(markup).toContain("h-[250px]")
    expect(markup).toContain("w-[300px]")
    expect(markup).toContain("flex h-full w-full self-start justify-center")
    expect(markup).toContain('data-ad-placement="recent-grid-card-1"')
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
    expect(markup).toContain("min-h-[600px]")
    expect(markup).toContain("!bg-transparent")
    expect(markup).toContain("[&amp;&gt;iframe]:!bg-transparent")
    expect(markup).toContain(">Advertisement</div>")
    expect(markup).not.toContain("Ad preview")
  })

  it("uses NitroPay demo creatives instead of the local placeholder preview", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="recent-right-rail"
        format="rail"
        hostname="localhost"
        previewEnabled
        demoEnabled
      />,
      {
        ads_enabled: true,
        nitropay_site_id: "12345",
      } as SiteConfig,
    )

    expect(markup).toContain('data-ad-provider="nitropay"')
    expect(markup).toContain('data-ad-demo="true"')
    expect(markup).toContain("NitroPay demo")
    expect(markup).toContain("160 × 600")
    expect(markup).toContain("bg-[#f0c060]/5")
    expect(markup).not.toContain("Ad preview")
  })

  it("adds NitroPay's demo option only when requested", () => {
    const sizes = adSizesForFormat("rail", false)

    expect(nitroPayAdOptions(sizes)).not.toHaveProperty("demo")
    expect(nitroPayAdOptions(sizes, true)).toMatchObject({ demo: true, sizes })
  })

  it.each([
    { name: "billing settings for a signed-in user", session: { ads_free: false }, href: "/account/billing" },
    { name: "the supporter page for a signed-out visitor", session: null, href: "/supporter" },
  ])("links the label to $name when billing is enabled", ({ session, href }) => {
    const markup = renderAdSlot(
      <AdSlot
        placement="leaderboards-right-rail"
        format="rail"
        hostname="turtle.chronicleclassic.com"
        previewEnabled={false}
      />,
      {
        ads_enabled: true,
        billing_enabled: true,
        nitropay_site_id: "12345",
      } as SiteConfig,
      session,
    )

    expect(markup).toContain(`href="${href}"`)
    expect(markup).toContain('title="Become a supporter to remove ads"')
    expect(markup).toContain("Go ad-free")
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

  it("does not render for an ad-free user", () => {
    expect(
      renderAdSlot(
        <AdSlot placement="leaderboards-right-rail" hostname="localhost" previewEnabled />,
        undefined,
        { ads_free: true },
      ),
    ).toBe("")
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

  it("shows the sidebar placement for any non-empty encounter list", () => {
    expect(shouldShowEncounterAd(0)).toBe(false)
    expect(shouldShowEncounterAd(8)).toBe(true)
    expect(shouldShowEncounterAd(40)).toBe(true)
  })
})
