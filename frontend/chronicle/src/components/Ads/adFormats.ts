import type { NitroPaySize } from "./nitroPay"

export type AdFormat = "responsive" | "rail"
export type RailLayout = "single" | "paired"

const formatSizes: Record<AdFormat, NitroPaySize[]> = {
  responsive: [
    [728, 90],
    [970, 90],
    [970, 250],
    [300, 250],
  ],
  rail: [[160, 600]],
}

export function adSizesForFormat(format: AdFormat, wideRail: boolean): NitroPaySize[] {
  if (format === "rail" && wideRail) {
    return [
      [300, 600],
      [160, 600],
    ]
  }
  return formatSizes[format]
}
