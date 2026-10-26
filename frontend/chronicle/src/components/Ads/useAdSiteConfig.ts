import { useEffect, useState } from "react"
import { useSiteConfig } from "@/api/siteConfigQuery"
import {
  readCachedAdSiteConfig,
  selectAdSiteConfig,
  writeCachedAdSiteConfig,
  type AdSiteConfig,
} from "./adSiteConfigCache"

/**
 * Returns the last known advertising subset immediately when it is less than
 * one hour old, while the canonical site-config request refreshes in parallel.
 */
export function useAdSiteConfig(): AdSiteConfig | undefined {
  const { data: siteConfig } = useSiteConfig()
  const [cachedConfig] = useState(readCachedAdSiteConfig)

  useEffect(() => {
    if (siteConfig) {
      writeCachedAdSiteConfig(selectAdSiteConfig(siteConfig))
    }
  }, [siteConfig])

  return siteConfig ? selectAdSiteConfig(siteConfig) : cachedConfig
}
