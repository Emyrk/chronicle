import type { AdFormat } from "./adFormats"

export type AdPlacement = `${string}-${string}`

export const AD_DISABLE_RAIL = "rail"
export const AD_DISABLE_RECENT_CONTENT = "recent-content"

export const TENANT_AD_DISABLE_OPTIONS = [
  { key: AD_DISABLE_RAIL, label: "Rail ads" },
  { key: AD_DISABLE_RECENT_CONTENT, label: "Recents content ads" },
] as const

export function isAdPlacementDisabled(
  disabledAds: readonly string[] | undefined,
  placement: AdPlacement,
  format: AdFormat,
): boolean {
  if (!disabledAds?.length) return false

  return (
    disabledAds.includes(placement) ||
    (format === "rail" && disabledAds.includes(AD_DISABLE_RAIL)) ||
    (format !== "rail" && placement.startsWith("recent-") && disabledAds.includes(AD_DISABLE_RECENT_CONTENT))
  )
}
