import type { SiteConfig } from "@/api/typesGenerated"

const AD_SITE_CONFIG_CACHE_KEY = "chronicle-ad-site-config-v1"
export const AD_SITE_CONFIG_CACHE_TTL_MS = 60 * 60 * 1000

export type AdSiteConfig = Pick<
  SiteConfig,
  "ads_enabled" | "billing_enabled" | "disabled_ads" | "nitropay_site_id"
>

type StoredAdSiteConfig = {
  config: AdSiteConfig
  cachedAt: number
}

function getBrowserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function isAdSiteConfig(value: unknown): value is AdSiteConfig {
  if (!value || typeof value !== "object") return false

  const config = value as Record<string, unknown>
  return (
    typeof config.ads_enabled === "boolean" &&
    typeof config.billing_enabled === "boolean" &&
    Array.isArray(config.disabled_ads) &&
    config.disabled_ads.every((item) => typeof item === "string") &&
    (config.nitropay_site_id === undefined || typeof config.nitropay_site_id === "string")
  )
}

export function selectAdSiteConfig(config: SiteConfig): AdSiteConfig {
  return {
    ads_enabled: config.ads_enabled,
    billing_enabled: config.billing_enabled,
    disabled_ads: config.disabled_ads,
    nitropay_site_id: config.nitropay_site_id,
  }
}

export function readCachedAdSiteConfig(
  storage: Storage | undefined = getBrowserStorage(),
  now = Date.now(),
): AdSiteConfig | undefined {
  if (!storage) return undefined

  try {
    const raw = storage.getItem(AD_SITE_CONFIG_CACHE_KEY)
    if (!raw) return undefined

    const stored = JSON.parse(raw) as Partial<StoredAdSiteConfig>
    if (
      typeof stored.cachedAt !== "number" ||
      !Number.isFinite(stored.cachedAt) ||
      stored.cachedAt > now ||
      now - stored.cachedAt >= AD_SITE_CONFIG_CACHE_TTL_MS ||
      !isAdSiteConfig(stored.config)
    ) {
      return undefined
    }

    return stored.config
  } catch {
    return undefined
  }
}

export function writeCachedAdSiteConfig(
  config: AdSiteConfig,
  storage: Storage | undefined = getBrowserStorage(),
  now = Date.now(),
): void {
  if (!storage) return

  try {
    storage.setItem(
      AD_SITE_CONFIG_CACHE_KEY,
      JSON.stringify({ config, cachedAt: now } satisfies StoredAdSiteConfig),
    )
  } catch {
    // Storage can be unavailable in privacy modes. The site-config query remains the fallback.
  }
}
