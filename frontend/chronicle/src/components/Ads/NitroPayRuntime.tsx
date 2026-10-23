import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { loadNitroPay } from "./nitroPay"
import { useAdSiteConfig } from "./useAdSiteConfig"

declare global {
  interface Window {
    __cmp?: (command: "addConsentLink") => void
    __uspapi?: (command: "addLink", version: 1) => void
  }
}

function addPrivacyLinks() {
  window.__cmp?.("addConsentLink")
  window.__uspapi?.("addLink", 1)
}

/**
 * Loads NitroPay's bundled CMP for every route on an ad-enabled tenant.
 * Individual AdSlot instances still own placement creation and navigation.
 */
export function NitroPayRuntime() {
  const adSiteConfig = useAdSiteConfig()
  const location = useLocation()
  const siteID = adSiteConfig?.ads_enabled ? adSiteConfig.nitropay_site_id : undefined

  useEffect(() => {
    if (!siteID) return

    void loadNitroPay(siteID)
      .then(addPrivacyLinks)
      .catch((error: unknown) => console.error("Unable to load NitroPay", error))
  }, [location.pathname, siteID])

  return null
}
