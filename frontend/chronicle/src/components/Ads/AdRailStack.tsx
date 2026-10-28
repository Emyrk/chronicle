import { cn } from "@/lib/utils"
import { AdSlot } from "./AdSlot"
import type { RailLayout } from "./adFormats"
import type { AdPlacement } from "./adPolicy"

const railStackBreakpointClasses = {
  xl: "xl:sticky xl:top-20",
  "2xl": "2xl:sticky 2xl:top-20",
} as const

const railSlotStaticClasses = {
  xl: "xl:static",
  "2xl": "2xl:static",
} as const

/** Keeps two rail placements together so they stay stacked instead of overlapping while sticky. */
export function AdRailStack({
  primaryPlacement,
  secondaryPlacement,
  railLayout = "single",
  railBreakpoint = "2xl",
  secondaryMinViewportHeight = 1360,
  hostname,
  previewEnabled,
  className,
}: {
  primaryPlacement: AdPlacement
  secondaryPlacement: AdPlacement
  railLayout?: RailLayout
  railBreakpoint?: keyof typeof railStackBreakpointClasses
  secondaryMinViewportHeight?: number
  /** Test seam for preview eligibility. Product callers should omit it. */
  hostname?: string
  /** Test seam for preview eligibility. Product callers should omit it. */
  previewEnabled?: boolean
  className?: string
}) {
  const staticClassName = railSlotStaticClasses[railBreakpoint]

  return (
    <div className={cn("shrink-0 self-start", railStackBreakpointClasses[railBreakpoint], className)}>
      <AdSlot
        placement={primaryPlacement}
        format="rail"
        railLayout={railLayout}
        railBreakpoint={railBreakpoint}
        hostname={hostname}
        previewEnabled={previewEnabled}
        className={staticClassName}
      />
      <AdSlot
        placement={secondaryPlacement}
        format="rail"
        railLayout={railLayout}
        railBreakpoint={railBreakpoint}
        hostname={hostname}
        previewEnabled={previewEnabled}
        minViewportHeight={secondaryMinViewportHeight}
        className={cn("mt-6", staticClassName)}
      />
    </div>
  )
}
