export function isLocalAdPreviewHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1"
}

export function shouldShowAdPreview(hostname: string, previewEnabled: boolean): boolean {
  return previewEnabled && isLocalAdPreviewHost(hostname)
}

export function shouldShowEncounterAd(encounterCount: number): boolean {
  return encounterCount > 0
}
