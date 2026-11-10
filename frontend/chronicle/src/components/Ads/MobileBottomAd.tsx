import { useEffect, useId, useRef } from "react"
import { AdSlot, type AdPlacement } from "./AdSlot"

const MOBILE_AD_OFFSET_PROPERTY = "--mobile-ad-offset"
const MOBILE_AD_OWNER_ATTRIBUTE = "data-mobile-ad-offset-owner"

export function MobileBottomAd({
  placement,
  hostname,
  previewEnabled,
}: {
  placement: AdPlacement
  hostname?: string
  previewEnabled?: boolean
}) {
  const shellRef = useRef<HTMLDivElement>(null)
  const ownerID = useId()

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const root = document.documentElement
    const updateOffset = () => {
      const height = Math.ceil(shell.getBoundingClientRect().height)
      if (height > 0) {
        root.setAttribute(MOBILE_AD_OWNER_ATTRIBUTE, ownerID)
        root.style.setProperty(MOBILE_AD_OFFSET_PROPERTY, `${height}px`)
      } else if (root.getAttribute(MOBILE_AD_OWNER_ATTRIBUTE) === ownerID) {
        root.removeAttribute(MOBILE_AD_OWNER_ATTRIBUTE)
        root.style.removeProperty(MOBILE_AD_OFFSET_PROPERTY)
      }
    }

    updateOffset()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(updateOffset)
    observer?.observe(shell)
    window.addEventListener("resize", updateOffset)

    return () => {
      observer?.disconnect()
      window.removeEventListener("resize", updateOffset)
      if (root.getAttribute(MOBILE_AD_OWNER_ATTRIBUTE) === ownerID) {
        root.removeAttribute(MOBILE_AD_OWNER_ATTRIBUTE)
        root.style.removeProperty(MOBILE_AD_OFFSET_PROPERTY)
      }
    }
  }, [ownerID])

  return (
    <>
      <div
        ref={shellRef}
        className="fixed inset-x-0 bottom-0 z-40 empty:hidden border-t border-border/70 bg-background/95 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.2)] backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden"
      >
        <AdSlot
          placement={placement}
          format="mobile-banner"
          hostname={hostname}
          previewEnabled={previewEnabled}
        />
      </div>
      <div aria-hidden="true" className="h-[var(--mobile-ad-offset,0px)] lg:hidden" />
    </>
  )
}
