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
        className="fixed inset-x-0 bottom-0 z-40 empty:hidden pb-[env(safe-area-inset-bottom)] lg:hidden"
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
