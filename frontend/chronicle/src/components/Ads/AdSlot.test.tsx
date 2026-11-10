import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { MemoryRouter } from "react-router-dom"
import type { Session } from "@/api/queries"
import type { SiteConfig } from "@/api/typesGenerated"
import { describe, expect, it, vi } from "vitest"
import { AdRailStack } from "./AdRailStack"
import { AdSlot } from "./AdSlot"
import { adFallbackPresentation, adRequestStateForKey } from "./adRequestState"
import { AdSuppressionProvider } from "./AdSuppressionProvider"
import { adSizeLabel, adSizesForFormat } from "./adFormats"
import { isAdPlacementDisabled } from "./adPolicy"
import {
  classifyNitroPayRenderedEvent,
  clearNitroPayAds,
  configureNitroPayScript,
  isNitroPayContainerCurrent,
  isNitroPayRenderedEventForPlacement,
  nitroPayAdOptions,
  nitroPayReportNeedsFrameGuard,
} from "./nitroPay"
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

  it("keeps a tall-screen rail pair in one sticky stack", () => {
    const markup = renderAdSlot(
      <AdRailStack
        primaryPlacement="leaderboards-right-rail"
        secondaryPlacement="leaderboards-right-rail-lower"
        viewportHeight={1360}
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("2xl:sticky")
    expect(markup).toContain("2xl:top-20")
    expect(markup).toContain('data-ad-placement="leaderboards-right-rail"')
    expect(markup).toContain('data-ad-placement="leaderboards-right-rail-lower"')
    expect(markup.match(/2xl:static/g)).toHaveLength(2)
    expect(markup).toContain("mt-6")
  })

  it("can keep a stacked rail sticky from the xl breakpoint", () => {
    const markup = renderAdSlot(
      <AdRailStack
        primaryPlacement="armory-right-rail"
        secondaryPlacement="armory-right-rail-lower"
        railLayout="paired-wide"
        railBreakpoint="xl"
        viewportHeight={1360}
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("xl:sticky")
    expect(markup).toContain("xl:top-20")
    expect(markup.match(/xl:static/g)).toHaveLength(2)
    expect(markup).toContain("min-[1840px]:w-[300px]")
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

  it("can widen paired rails earlier around narrower page content", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="armory-left-rail"
        format="rail"
        railLayout="paired-wide"
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("min-[1840px]:w-[300px]")
    expect(markup).not.toContain("min-[2080px]:w-[300px]")
  })

  it("can expose a single rail at xl before paired rails fit", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="armory-right-rail"
        format="rail"
        railLayout="paired-wide"
        railBreakpoint="xl"
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("xl:block")
    expect(markup).toContain("xl:sticky")
    expect(markup).toContain("xl:top-20")
    expect(markup).not.toContain("2xl:sticky")
  })

  it("keeps compact rails fixed at 160 × 600 on wide screens", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="instance-right-rail"
        format="rail"
        railLayout="compact"
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain("160 × 600")
    expect(markup).not.toContain("300 × 600")
    expect(markup).not.toContain("min-[1920px]:w-[300px]")
    expect(markup).not.toContain("min-[2080px]:w-[300px]")
    expect(markup).toContain("2xl:block")
  })

  it("does not render a height-gated rail below its minimum viewport height", () => {
    expect(
      renderAdSlot(
        <AdSlot
          placement="instance-right-rail-lower"
          format="rail"
          railLayout="compact"
          minViewportHeight={1360}
          viewportHeight={1200}
          hostname="localhost"
          previewEnabled
        />,
      ),
    ).toBe("")
  })

  it("renders a height-gated rail when the viewport is tall enough", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="instance-right-rail-lower"
        format="rail"
        railLayout="compact"
        minViewportHeight={1360}
        viewportHeight={1360}
        hostname="localhost"
        previewEnabled
      />,
    )

    expect(markup).toContain('data-ad-placement="instance-right-rail-lower"')
    expect(markup).toContain("160 × 600")
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

  it("uses a compact mobile creative and wide desktop sizes for adaptive content", () => {
    const markup = renderAdSlot(
      <AdSlot placement="armory-search-empty" format="adaptive" hostname="localhost" previewEnabled />,
    )

    expect(adSizesForFormat("adaptive", false, true)).toEqual([[300, 100]])
    expect(adSizesForFormat("adaptive", false, false)).toEqual([
      [728, 90],
      [970, 90],
      [970, 250],
      [300, 250],
    ])
    expect(adSizeLabel("adaptive", false, true)).toBe("300 × 100")
    expect(adSizeLabel("adaptive", false, false)).toBe("responsive")
    expect(markup).toContain("w-[300px] lg:w-full")
    expect(markup).toContain("h-[250px]")
    expect(markup).toContain('data-ad-placement="armory-search-empty"')
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
    expect(markup).toContain("pointer-events-none opacity-0")
    expect(markup).not.toContain("[&amp;&gt;*]:opacity-0")
    expect(markup).toContain('data-ad-rendered="false"')
    expect(markup).toContain("text-muted-foreground/60 invisible")
    expect(markup).toContain(">Advertisement</div>")
    expect(markup).not.toContain("Ad preview")
  })

  it("keys request state so a changed request returns to pending", () => {
    expect(adRequestStateForKey({ key: "request-a", state: "filled" }, "request-a")).toBe("filled")
    expect(adRequestStateForKey({ key: "request-a", state: "filled" }, "request-b")).toBe("pending")
    expect(adRequestStateForKey(undefined, "request-a")).toBe("pending")
  })

  it("activates fallback content only after a confirmed no-fill", () => {
    expect(adFallbackPresentation("pending")).toEqual({
      visible: true,
      interactive: false,
      ariaHidden: true,
      inert: true,
    })
    expect(adFallbackPresentation("error")).toEqual({
      visible: true,
      interactive: false,
      ariaHidden: true,
      inert: true,
    })
    expect(adFallbackPresentation("no_fill")).toEqual({
      visible: true,
      interactive: true,
      ariaHidden: false,
      inert: false,
    })
    expect(adFallbackPresentation("filled")).toEqual({
      visible: false,
      interactive: false,
      ariaHidden: true,
      inert: true,
    })
  })

  it("keeps a pending card fallback inert while it fills the grid cell", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="recent-grid-card-1"
        format="card"
        hostname="turtle.chronicleclassic.com"
        previewEnabled={false}
        renderFallback={({ state, interactive }) => (
          <a href="/technical-hint" data-state={state} data-interactive={interactive}>
            Technical hint
          </a>
        )}
      />,
      {
        ads_enabled: true,
        nitropay_site_id: "12345",
      } as SiteConfig,
    )

    expect(markup).toContain('data-ad-request-state="pending"')
    expect(markup).toContain('data-ad-fallback-interactive="false"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain(" inert=\"\"")
    expect(markup).toContain("pointer-events-none select-none")
    expect(markup).toContain("w-full h-full min-h-[200px]")
    expect(markup).not.toContain("w-[300px]")
    expect(markup).not.toContain(">Advertisement</div>")
    expect(markup).toContain("absolute inset-0")
    expect(markup).toContain('href="/technical-hint"')
  })

  it("can show an interactive fallback instead of the local ad preview", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="recent-grid-card-1"
        format="card"
        hostname="localhost"
        previewEnabled
        previewFallback
        renderFallback={({ interactive }) => (
          <a href="/technical/hints" data-interactive={interactive}>Technical hint</a>
        )}
      />,
    )

    expect(markup).toContain('aria-label="Technical hint preview"')
    expect(markup).toContain('data-ad-provider="fallback-preview"')
    expect(markup).toContain('data-ad-fallback-interactive="true"')
    expect(markup).toContain('href="/technical/hints"')
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

  it("defers offscreen rendering and adds NitroPay's demo option only when requested", () => {
    const sizes = adSizesForFormat("rail", false)

    expect(nitroPayAdOptions(sizes)).toMatchObject({
      outstream: "never",
      refreshLimit: 10,
      refreshTime: 30,
      renderVisibleOnly: true,
      sizes,
    })
    expect(nitroPayAdOptions(sizes)).not.toHaveProperty("demo")
    expect(nitroPayAdOptions(sizes, true)).toMatchObject({
      demo: true,
      outstream: "never",
      refreshLimit: 10,
      refreshTime: 30,
      renderVisibleOnly: true,
      sizes,
    })
  })

  it("silences NitroPay's default production console logging", () => {
    const script = { dataset: {} } as unknown as HTMLScriptElement

    configureNitroPayScript(script, "2768")

    expect(script.async).toBe(true)
    expect(script.dataset.cfasync).toBe("false")
    expect(script.dataset.logLevel).toBe("silent")
    expect(script.src).toBe("https://s.nitropay.com/ads-2768.js")
  })

  it("does not request an ad for an unmounted or replacement container", () => {
    const container = { id: "nitropay-instance-right-rail-lower", isConnected: true } as HTMLElement
    const replacement = { id: container.id, isConnected: true } as HTMLElement
    const controller = new AbortController()

    expect(isNitroPayContainerCurrent(container, controller.signal, container)).toBe(true)
    expect(isNitroPayContainerCurrent(container, controller.signal, replacement)).toBe(false)
    expect(isNitroPayContainerCurrent({ ...container, isConnected: false } as HTMLElement, controller.signal, container)).toBe(
      false,
    )

    controller.abort()
    expect(isNitroPayContainerCurrent(container, controller.signal, container)).toBe(false)
  })

  it("guards NitroPay reporting for direct non-URL creative frames", () => {
    expect(nitroPayReportNeedsFrameGuard("IFRAME", "")).toBe(true)
    expect(nitroPayReportNeedsFrameGuard("iframe", "about:blank")).toBe(true)
    expect(nitroPayReportNeedsFrameGuard("IFRAME", "https://ads.example.com/creative")).toBe(false)
    expect(nitroPayReportNeedsFrameGuard("DIV", "")).toBe(false)
  })

  it("matches NitroPay render events to their placement", () => {
    const directEvent = Object.assign(new Event("nitroAds.rendered"), {
      adInfo: { adUnitCode: "nitropay-recent-right-rail", bidder: "example-bidder" },
    })
    const customEvent = Object.assign(new Event("nitroAds.rendered"), {
      detail: { adInfo: { adUnitCode: "nitropay-recent-left-rail", bidder: "example-bidder" } },
    })
    const blankEvent = Object.assign(new Event("nitroAds.rendered"), {
      detail: {
        adInfo: {
          adUnitCode: "nitropay-recent-right-rail",
          bidder: "blank",
          creativeId: "",
          cpm: 0,
        },
      },
    })

    expect(classifyNitroPayRenderedEvent(directEvent, "nitropay-recent-right-rail")).toBe("filled")
    expect(classifyNitroPayRenderedEvent(customEvent, "nitropay-recent-left-rail")).toBe("filled")
    expect(classifyNitroPayRenderedEvent(blankEvent, "nitropay-recent-right-rail")).toBe("no_fill")
    expect(classifyNitroPayRenderedEvent(directEvent, "nitropay-recent-left-rail")).toBe("unrelated")
    expect(classifyNitroPayRenderedEvent(new Event("nitroAds.rendered"), "nitropay-recent-right-rail")).toBe(
      "unrelated",
    )
    expect(isNitroPayRenderedEventForPlacement(directEvent, "nitropay-recent-right-rail")).toBe(true)
    expect(isNitroPayRenderedEventForPlacement(blankEvent, "nitropay-recent-right-rail")).toBe(false)
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

  it("applies tenant opt-outs by ad group and exact placement", () => {
    expect(isAdPlacementDisabled(["rail"], "leaderboards-right-rail", "rail")).toBe(true)
    expect(isAdPlacementDisabled(["recent-content"], "recent-between-pages", "responsive")).toBe(true)
    expect(isAdPlacementDisabled(["recent-content"], "recent-right-rail", "rail")).toBe(false)
    expect(isAdPlacementDisabled(["statistics-encounter-sidebar"], "statistics-encounter-sidebar", "responsive")).toBe(
      true,
    )
  })

  it("does not render a tenant-disabled ad group", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="leaderboards-right-rail"
        format="rail"
        hostname="turtle.chronicleclassic.com"
        previewEnabled={false}
      />,
      {
        ads_enabled: true,
        disabled_ads: ["rail"],
        nitropay_site_id: "12345",
      } as unknown as SiteConfig,
    )

    expect(markup).toBe("")
  })

  it("does not render for a tenant with ads disabled", () => {
    const markup = renderAdSlot(
      <AdSlot
        placement="leaderboards-right-rail"
        format="rail"
        hostname="turtle.chronicleclassic.com"
        previewEnabled={false}
        renderFallback={() => <a href="/technical-hint">Technical hint</a>}
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
        <AdSlot
          placement="leaderboards-right-rail"
          format="rail"
          hostname="localhost"
          previewEnabled
          renderFallback={() => <a href="/technical-hint">Technical hint</a>}
        />,
        undefined,
        { ads_free: true },
      ),
    ).toBe("")
  })

  it.each([
    { name: "anonymous viewers", session: null },
    { name: "signed-in viewers", session: { ads_free: false } },
  ])("does not render when the page suppresses ads for $name", ({ session }) => {
    expect(
      renderAdSlot(
        <AdSuppressionProvider suppressed>
          <AdSlot placement="instance-overview-summary" hostname="localhost" previewEnabled />
        </AdSuppressionProvider>,
        undefined,
        session,
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
