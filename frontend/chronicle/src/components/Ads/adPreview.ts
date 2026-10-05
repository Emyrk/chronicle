export const COMPACT_ENCOUNTER_AD_MAX_ITEMS = 8

export function isLocalAdPreviewHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

export function shouldShowCompactEncounterAd(encounterCount: number): boolean {
  return encounterCount > 0 && encounterCount <= COMPACT_ENCOUNTER_AD_MAX_ITEMS
}
