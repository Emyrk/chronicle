import type { NitroPaySize } from "./nitroPay"

export type AdFormat = "responsive" | "rail" | "card"
export type RailLayout = "single" | "paired"

const formatSizes: Record<AdFormat, NitroPaySize[]> = {
  responsive: [
    [728, 90],
    [970, 90],
    [970, 250],
    [300, 250],
  ],
  rail: [[160, 600]],
  card: [[300, 250]],
}

const compactCardSizes: NitroPaySize[] = [[300, 100]]

export function adSizesForFormat(format: AdFormat, wideRail: boolean, compactCard = false): NitroPaySize[] {
  if (format === "rail" && wideRail) {
    return [
      [300, 600],
      [160, 600],
    ]
  }
  if (format === "card" && compactCard) return compactCardSizes
  return formatSizes[format]
}

export function adSizeLabel(format: AdFormat, wideRail: boolean, compactCard = false): string {
  if (format === "responsive") return "responsive"
  if (format === "card") return compactCard ? "300 × 100" : "300 × 250"
  return wideRail ? "300 × 600 / 160 × 600" : "160 × 600"
}
