import { useEffect } from "react"
import { useSiteConfig } from "@/api/queries"
import { cn } from "@/lib/utils"
import { shouldShowAdPreview } from "./adPreview"
import { clearNitroPayAds, requestNitroPayAd, type NitroPayAd, type NitroPaySize } from "./nitroPay"

export type AdPlacement = `${string}-${string}`

export type AdFormat = "responsive" | "rail"

const formatClasses: Record<AdFormat, string> = {
  responsive: "hidden w-full lg:block",
  rail: "hidden w-40 shrink-0 self-start 2xl:sticky 2xl:top-20 2xl:block",
}

const frameClasses: Record<AdFormat, string> = {
  responsive: "min-h-28",
  rail: "min-h-[600px]",
}

const formatSizes: Record<AdFormat, NitroPaySize[]> = {
  responsive: [
    [728, 90],
    [970, 90],
    [970, 250],
    [300, 250],
  ],
  rail: [[160, 600]],
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
  hostname = window.location.hostname,
  previewEnabled = import.meta.env.DEV && import.meta.env.CHRONICLE_PREVIEW_ADS,
  className,
}: {
  /** Stable hyphenated identifier; use kebab-case for reporting and placement-specific policy. */
  placement: AdPlacement
  format?: AdFormat
  hostname?: string
  /** Test seam for preview eligibility. Product callers should use the environment flag. */
  previewEnabled?: boolean
  className?: string
}) {
  const { data: siteConfig } = useSiteConfig()
  const showPreview = shouldShowAdPreview(hostname, previewEnabled)
  const siteID = siteConfig?.ads_enabled ? siteConfig.nitropay_site_id : undefined
  const adID = `nitropay-${placement}`

  useEffect(() => {
    if (!siteID || showPreview) return

    let active = true
    let ads: NitroPayAd[] = []
    void requestNitroPayAd(siteID, adID, formatSizes[format])
      .then((createdAds) => {
        if (!active) {
          clearNitroPayAds(createdAds)
          return
        }
        ads = createdAds
      })
      .catch((error: unknown) => {
        console.error(`Unable to load NitroPay placement ${placement}`, error)
      })

    return () => {
      active = false
      clearNitroPayAds(ads)
    }
  }, [adID, format, placement, showPreview, siteID])

  if (!showPreview && !siteID) {
    return null
  }

  return (
    <aside
      className={cn(formatClasses[format], className)}
      aria-label={showPreview ? "Advertisement preview" : "Advertisement"}
      data-ad-placement={placement}
      data-ad-provider={showPreview ? "preview" : "nitropay"}
    >
      <div>
        {showPreview && (
          <div className="mb-1.5 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
            Advertisement
          </div>
        )}
        <div
          id={adID}
          className={cn(
            showPreview &&
              "relative flex items-center justify-center overflow-hidden rounded-md border border-dashed border-border/60 bg-muted/10",
            showPreview && frameClasses[format],
          )}
        >
          {showPreview && (
            <>
              <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(135deg,currentColor_12.5%,transparent_12.5%,transparent_50%,currentColor_50%,currentColor_62.5%,transparent_62.5%,transparent)] [background-size:12px_12px]" />
              <div className="relative text-center text-muted-foreground/55">
                <p className="text-[10px] font-medium uppercase tracking-[0.16em]">Ad preview</p>
                <p className="mt-1 font-mono text-[10px]">
                  {format === "rail" ? "160 × 600" : "responsive"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
