import type { NitroPaySize } from "./nitroPay"

export type AdFormat = "responsive" | "rail" | "card" | "sidebar"
export type RailLayout = "single" | "paired" | "compact"

const formatSizes: Record<AdFormat, NitroPaySize[]> = {
  responsive: [
    [728, 90],
    [970, 90],
    [970, 250],
    [300, 250],
  ],
  rail: [[160, 600]],
  card: [[300, 250]],
  sidebar: [
    [160, 600],
    [240, 400],
    [250, 250],
  ],
}

const compactCardSizes: NitroPaySize[] = [[300, 100]]

export function adSizesForFormat(
  format: AdFormat,
  wideRail: boolean,
  compactCard = false,
  availableHeight?: number,
): NitroPaySize[] {
  if (format === "rail" && wideRail) {
    return [
      [300, 600],
      [160, 600],
    ]
  }
  if (format === "card" && compactCard) return compactCardSizes
  if (format === "sidebar") {
    if (availableHeight === undefined) return []
    return formatSizes.sidebar.filter(([, height]) => height <= availableHeight)
  }
  return formatSizes[format]
}

export function adSizeLabel(
  format: AdFormat,
  wideRail: boolean,
  compactCard = false,
  availableHeight?: number,
): string {
  if (format === "responsive") return "responsive"
  if (format === "card") return compactCard ? "300 × 100" : "300 × 250"
  return adSizesForFormat(format, wideRail, compactCard, availableHeight)
    .map(([width, height]) => `${width} × ${height}`)
    .join(" / ")
}
