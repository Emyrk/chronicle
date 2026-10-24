import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { Link } from "react-router-dom"
import { useSession } from "@/api/queries"
import { cn } from "@/lib/utils"
import { shouldShowAdPreview } from "./adPreview"
import { adSizeLabel, adSizesForFormat, type AdFormat, type RailLayout } from "./adFormats"
import {
  adFallbackPresentation,
  adRequestStateForKey,
  type AdRequestSnapshot,
  type AdRequestState,
} from "./adRequestState"
import { isAdPlacementDisabled, type AdPlacement } from "./adPolicy"
import {
  classifyNitroPayRenderedEvent,
  clearNitroPayAds,
  guardNitroPayReportFrameAccess,
  requestNitroPayAd,
  type NitroPayAd,
} from "./nitroPay"
import { useAdSiteConfig } from "./useAdSiteConfig"
import { useAdsSuppressed } from "./adSuppression"

export type { AdRequestState } from "./adRequestState"
export type { AdPlacement } from "./adPolicy"

export interface AdFallbackRenderProps {
  /** The current state of this exact NitroPay request. */
  state: Exclude<AdRequestState, "filled">
  /** True only after NitroPay confirms bidder="blank" for this request. */
  interactive: boolean
  /** True when the slot is using its reduced-height mobile size. */
  compact: boolean
}

export type AdFallbackRenderer = (props: AdFallbackRenderProps) => ReactNode

const formatClasses: Record<AdFormat, string> = {
  responsive: "hidden w-full lg:block",
  adaptive: "flex h-full w-full self-start justify-center",
  rail: "hidden w-40 shrink-0 self-start",
  card: "flex h-full w-full self-start justify-center",
  sidebar: "hidden w-[250px] lg:block",
}

const railBreakpointClasses = {
  xl: "xl:sticky xl:top-20 xl:block",
  "2xl": "2xl:sticky 2xl:top-20 2xl:block",
} as const

const railLayoutClasses: Record<RailLayout, string> = {
  single: "min-[1920px]:w-[300px]",
  paired: "min-[2080px]:w-[300px]",
  "paired-wide": "min-[1840px]:w-[300px]",
  compact: "",
}

const railLayoutQueries: Record<RailLayout, string | undefined> = {
  single: "(min-width: 1920px)",
  paired: "(min-width: 2080px)",
  "paired-wide": "(min-width: 1840px)",
  compact: undefined,
}

const frameClasses: Record<AdFormat, string> = {
  responsive: "min-h-28",
  adaptive: "w-[300px] lg:w-full",
  rail: "min-h-[600px]",
  card: "w-[300px]",
  sidebar: "min-h-[250px]",
}

// Reserve room for the label above the creative and breathing room below it.
const SIDEBAR_VERTICAL_GUTTER = 40

function useMediaQuery(query: string | undefined): boolean {
  const [matches, setMatches] = useState(() =>
    query && typeof window !== "undefined" ? (window.matchMedia?.(query).matches ?? false) : false,
  )

  useEffect(() => {
    if (!query || !window.matchMedia) return

    const mediaQuery = window.matchMedia(query)
    const handleChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [query])

  return matches
}

function useSidebarViewportHeight(enabled: boolean, element: RefObject<HTMLElement | null>): number | undefined {
  const [availableHeight, setAvailableHeight] = useState<number>()

  useEffect(() => {
    if (!enabled) return

    const update = () => {
      const scrollContainer = element.current?.parentElement
      if (!scrollContainer) return
      setAvailableHeight(
        Math.max(0, Math.floor(window.innerHeight - scrollContainer.getBoundingClientRect().top - SIDEBAR_VERTICAL_GUTTER)),
      )
    }

    const animationFrame = window.requestAnimationFrame(update)
    window.addEventListener("resize", update)

    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update)
    if (element.current) observer?.observe(element.current)
    if (element.current?.parentElement) observer?.observe(element.current.parentElement)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.removeEventListener("resize", update)
      observer?.disconnect()
    }
  }, [element, enabled])

  return availableHeight
}

/**
 * The single entry point for Chronicle ad placements.
 *
 * Keep preview, tenant eligibility, consent, script loading, and live-serving
 * behavior centralized here so callers only choose where an ad belongs.
 */
export function AdSlot({
  placement,
  format = "responsive",
  railLayout = "single",
  railBreakpoint = "2xl",
  hostname = window.location.hostname,
  previewEnabled = import.meta.env.DEV && import.meta.env.CHRONICLE_PREVIEW_ADS,
  demoEnabled = import.meta.env.CHRONICLE_PREVIEW_ADS_DEMO,
  minViewportHeight,
  viewportHeight,
  availableHeight,
  renderFallback,
  previewFallback = false,
  className,
}: {
  /** Stable hyphenated identifier; use kebab-case for reporting and placement-specific policy. */
  placement: AdPlacement
  format?: AdFormat
  /** Paired rails wait for extra width; paired-wide suits narrower content; compact stays 160px. */
  railLayout?: RailLayout
  /** Rails default to 2xl; use xl when the page intentionally falls back to a single rail. */
  railBreakpoint?: keyof typeof railBreakpointClasses
  hostname?: string
  /** Test seam for preview eligibility. Product callers should use the environment flag. */
  previewEnabled?: boolean
  /** Test seam for NitroPay demo creatives. Product callers should use the environment flag. */
  demoEnabled?: boolean
  /** Do not render or request the placement below this viewport height. */
  minViewportHeight?: number
  /** Test seam for minimum viewport-height eligibility. Product callers should omit it. */
  viewportHeight?: number
  /** Test seam for sidebar size eligibility. Product callers should use viewport measurement. */
  availableHeight?: number
  /** Render fixed-format content while a live request is unfilled. AdSlot owns its interactivity. */
  renderFallback?: AdFallbackRenderer
  /** In local ad-preview mode, show the fallback instead of the provider placeholder. */
  previewFallback?: boolean
  className?: string
}) {
  const adSiteConfig = useAdSiteConfig()
  const { data: session, isLoading: sessionLoading } = useSession()
  const adsSuppressed = useAdsSuppressed()
  const [requestSnapshot, setRequestSnapshot] = useState<AdRequestSnapshot>()
  const slotRef = useRef<HTMLElement>(null)
  const measuredAvailableHeight = useSidebarViewportHeight(format === "sidebar", slotRef)
  const sidebarAvailableHeight = availableHeight ?? measuredAvailableHeight
  const showDemo = demoEnabled === true
  const showPreview = !showDemo && shouldShowAdPreview(hostname, previewEnabled)
  const siteID = adSiteConfig?.ads_enabled ? adSiteConfig.nitropay_site_id : undefined
  const adID = `nitropay-${placement}`
  const wideRail = useMediaQuery(format === "rail" ? railLayoutQueries[railLayout] : undefined)
  const compactCard = useMediaQuery(
    format === "card" || format === "adaptive" ? "(max-width: 1023px)" : undefined,
  )
  const measuredViewportHeightEligible = useMediaQuery(
    minViewportHeight === undefined ? undefined : `(min-height: ${minViewportHeight}px)`,
  )
  const viewportHeightEligible =
    minViewportHeight === undefined ||
    (viewportHeight === undefined ? measuredViewportHeightEligible : viewportHeight >= minViewportHeight)
  const eligibleSizes = useMemo(
    () => adSizesForFormat(format, wideRail, compactCard, sidebarAvailableHeight),
    [compactCard, format, sidebarAvailableHeight, wideRail],
  )
  const placementDisabled = isAdPlacementDisabled(adSiteConfig?.disabled_ads, placement, format)
  const adsAllowed =
    !adsSuppressed &&
    !sessionLoading &&
    !session?.ads_free &&
    !placementDisabled &&
    viewportHeightEligible
  const requestKey = `${adID}:${eligibleSizes.map((size) => size.join("x")).join(",")}`
  const requestState = adRequestStateForKey(requestSnapshot, requestKey)
  const liveCreativeRendered = requestState === "filled"
  const showFallbackPreview = Boolean(renderFallback) && previewFallback && showPreview && !showDemo
  const usesFallbackFrame =
    Boolean(renderFallback) && format !== "responsive" && !showDemo && (!showPreview || showFallbackPreview)
  const effectiveFallbackState = showFallbackPreview ? "no_fill" : requestState
  const fallbackPresentation = adFallbackPresentation(effectiveFallbackState)
  const fallbackVisible = usesFallbackFrame && fallbackPresentation.visible
  const fallbackState = effectiveFallbackState === "filled" ? undefined : effectiveFallbackState
  const fallbackInteractive = fallbackPresentation.interactive
  const adLabelVisible = (showPreview && !showFallbackPreview) || showDemo || liveCreativeRendered
  // Grid cards let the fallback fill the cell like its neighbours; only a
  // rendered creative needs the fixed frame and the advertisement label.
  const fallbackFillsCell = format === "card" && fallbackVisible

  useEffect(() => {
    if (!adsAllowed || !siteID || showPreview || eligibleSizes.length === 0) return

    let active = true
    let noFill = false
    let ads: NitroPayAd[] = []
    setRequestSnapshot({ key: requestKey, state: "pending" })

    const handleRendered = (event: Event) => {
      if (noFill) return

      const result = classifyNitroPayRenderedEvent(event, adID)
      if (result === "no_fill") {
        // A confirmed no-fill makes the fallback interactive. Stop NitroPay
        // refreshes first so a later creative cannot replace a user's click target.
        noFill = true
        clearNitroPayAds(ads)
        ads = []
        setRequestSnapshot({ key: requestKey, state: result })
      } else if (result === "filled") {
        setRequestSnapshot({ key: requestKey, state: result })
      }
    }
    document.addEventListener("nitroAds.rendered", handleRendered)

    void requestNitroPayAd(siteID, adID, eligibleSizes, showDemo)
      .then((createdAds) => {
        if (!active || noFill) {
          clearNitroPayAds(createdAds)
          return
        }
        ads = createdAds
      })
      .catch((error: unknown) => {
        if (active) {
          setRequestSnapshot({ key: requestKey, state: "error" })
        }
        console.error(`Unable to load NitroPay placement ${placement}`, error)
      })

    return () => {
      active = false
      document.removeEventListener("nitroAds.rendered", handleRendered)
      clearNitroPayAds(ads)
    }
  }, [adID, adsAllowed, eligibleSizes, placement, requestKey, showDemo, showPreview, siteID])

  // Fail closed while deciding so paid supporters never see an ad flash.
  if (!adsAllowed || (!showPreview && !siteID)) {
    return null
  }

  if (format === "sidebar" && eligibleSizes.length === 0) {
    return <aside ref={slotRef} className={cn(formatClasses.sidebar, className)} aria-hidden="true" />
  }

  return (
    <aside
      ref={slotRef}
      className={cn(
        formatClasses[format],
        format === "rail" && railLayoutClasses[railLayout],
        format === "rail" && railBreakpointClasses[railBreakpoint],
        className,
      )}
      aria-label={showFallbackPreview ? "Technical hint preview" : showPreview ? "Advertisement preview" : "Advertisement"}
      data-ad-placement={placement}
      data-ad-provider={showFallbackPreview ? "fallback-preview" : showPreview ? "preview" : "nitropay"}
      data-ad-demo={showDemo || undefined}
      data-ad-rendered={!showPreview && !showDemo ? liveCreativeRendered : undefined}
      data-ad-request-state={!showPreview && !showDemo ? requestState : undefined}
    >
      <div className={cn(fallbackFillsCell && "h-full w-full")}>
        {fallbackFillsCell ? null : adSiteConfig?.billing_enabled ? (
          <Link
            to={session ? "/account/billing" : "/supporter"}
            title="Become a supporter to remove ads"
            className={cn(
              "group mb-1.5 grid text-center text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60 transition-colors hover:text-[#f0c060] focus-visible:text-[#f0c060]",
              !adLabelVisible && "invisible",
            )}
          >
            {/* Both labels share one grid cell so swapping on hover never shifts layout. */}
            <span className="col-start-1 row-start-1 group-hover:invisible group-focus-visible:invisible">
              Advertisement
            </span>
            <span className="invisible col-start-1 row-start-1 group-hover:visible group-focus-visible:visible" aria-hidden="true">
              Go ad-free
            </span>
          </Link>
        ) : (
          <div
            className={cn(
              "mb-1.5 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60",
              !adLabelVisible && "invisible",
            )}
          >
            Advertisement
          </div>
        )}
{usesFallbackFrame ? (
          <div
            className={cn(
              "relative overflow-hidden",
              format === "sidebar" && "flex justify-center",
              fallbackFillsCell
                ? cn("w-full", compactCard ? "h-[100px]" : "h-full min-h-[200px]")
                : cn(
                    frameClasses[format],
                    (format === "card" || format === "adaptive") && (compactCard ? "h-[100px]" : "h-[250px]"),
                  ),
            )}
          >
            <div
              id={adID}
              onClickCapture={(event) => guardNitroPayReportFrameAccess(event.currentTarget, event.target)}
              className={cn(
                "absolute inset-0 !bg-transparent [&>iframe]:!bg-transparent",
                liveCreativeRendered ? "opacity-100" : "pointer-events-none opacity-0",
              )}
            />
            {fallbackVisible && fallbackState && renderFallback && (
              <div
                data-ad-fallback=""
                data-ad-fallback-interactive={fallbackInteractive}
                aria-hidden={fallbackPresentation.ariaHidden}
                inert={fallbackPresentation.inert}
                className={cn(
                  "absolute inset-0 overflow-hidden",
                  !fallbackInteractive && "pointer-events-none select-none",
                )}
              >
                {renderFallback({ state: fallbackState, interactive: fallbackInteractive, compact: compactCard })}
              </div>
            )}
          </div>
        ) : (
          <div
            id={adID}
            onClickCapture={(event) => guardNitroPayReportFrameAccess(event.currentTarget, event.target)}
            className={cn(
              showPreview
                ? "relative flex items-center justify-center overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/10"
                : showDemo
                  ? "relative flex items-center justify-center overflow-hidden rounded-md border border-dashed border-[#f0c060]/35 bg-[#f0c060]/5 [&>iframe]:relative [&>iframe]:z-10 [&>iframe]:!bg-transparent"
                  : cn(
                      "!bg-transparent [&>iframe]:!bg-transparent",
                      liveCreativeRendered ? "opacity-100" : "pointer-events-none opacity-0",
                    ),
              format === "sidebar" && "flex justify-center",
              (showPreview || showDemo || format !== "responsive") && frameClasses[format],
              (format === "card" || format === "adaptive") && (compactCard ? "h-[100px]" : "h-[250px]"),
            )}
          >
            {(showPreview || showDemo) && (
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(135deg,currentColor_12.5%,transparent_12.5%,transparent_50%,currentColor_50%,currentColor_62.5%,transparent_62.5%,transparent)] [background-size:12px_12px]" />
                <div className={cn("relative text-center", showDemo ? "text-[#f0c060]/70" : "text-muted-foreground/55")}>
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em]">
                    {showDemo ? "NitroPay demo" : "Ad preview"}
                  </p>
                  <p className="mt-1 font-mono text-[10px]">
                    {adSizeLabel(format, wideRail, compactCard, sidebarAvailableHeight)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
