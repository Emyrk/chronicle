import { useMemo } from "react"
import { EyeOff } from "lucide-react"
import type { ParseScoreSpread } from "@/api/typesGenerated"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { cn } from "@/lib/utils"
import { parseHexColor } from "@/pages/Instance/parseColors"
import { formatMetric } from "@/pages/Parsing/cohort/cohortStats"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { formatBoxPlotTick } from "@/pages/Rankings/boxPlotScale"
import { spreadBands, spreadCutoff, spreadScale, spreadSpecLabel, type SpreadScale } from "./spreadBands"

/** Tier cutoffs shown as columns beside each bar. */
const COLUMN_FLOORS = [50, 75, 95, 99] as const
const LEGEND = [
  { floor: 0, label: "0–24" },
  { floor: 25, label: "25–49" },
  { floor: 50, label: "50–74" },
  { floor: 75, label: "75–94" },
  { floor: 95, label: "95–98" },
  { floor: 99, label: "99" },
  { floor: 100, label: "100" },
]

function spreadRowKey(spread: ParseScoreSpread): string {
  return `${spread.player_class}:${spread.player_spec ?? ""}:${spread.player_sub_spec ?? ""}`
}

/**
 * One row per class/spec cohort on a shared axis. Each bar spans the
 * cohort's min→max, cut into parse-tier bands at the value each tier takes.
 */
export function SpreadChart({
  spreads,
  metricLabel,
  onRowClick,
  onHide,
}: {
  spreads: readonly ParseScoreSpread[]
  metricLabel: string
  onRowClick: (spread: ParseScoreSpread) => void
  onHide: (spread: ParseScoreSpread) => void
}) {
  const scale = useMemo(() => spreadScale(spreads), [spreads])

  return (
    <TooltipProvider>
      <div className="space-y-0.5">
        {/* Column headers */}
        <div className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          <div className="w-24 shrink-0 sm:w-36">Spec</div>
          <div className="flex-1" />
          {COLUMN_FLOORS.map((floor) => (
            <div key={floor} className="hidden w-14 shrink-0 items-center justify-end gap-1 md:flex">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: parseHexColor(floor) }} />
              {floor}+
            </div>
          ))}
          <div className="w-14 shrink-0 text-right md:hidden">95+</div>
          <div className="hidden w-12 shrink-0 text-right sm:block">Kills</div>
          <div className="hidden w-6 shrink-0 sm:block" />
        </div>

        {spreads.map((spread) => (
          <SpreadRow
            key={spreadRowKey(spread)}
            spread={spread}
            scale={scale}
            metricLabel={metricLabel}
            onClick={() => onRowClick(spread)}
            onHide={() => onHide(spread)}
          />
        ))}

        {/* Axis */}
        <div className="flex items-center gap-3 px-1 pt-2">
          <div className="w-24 shrink-0 sm:w-36" />
          <div className="relative h-6 flex-1 border-t border-border/60">
            {scale.ticks.map((v, i) => (
              <span
                key={v}
                className={cn(
                  "absolute top-0 flex flex-col font-mono text-[10px] tabular-nums text-muted-foreground/70",
                  i === 0 ? "items-start" : i === scale.ticks.length - 1 ? "-translate-x-full items-end" : "-translate-x-1/2 items-center",
                  i !== 0 && i !== scale.ticks.length - 1 && "hidden sm:flex",
                )}
                style={{ left: `${((v - scale.min) / (scale.max - scale.min)) * 100}%` }}
              >
                <span className="h-1.5 w-px bg-border" />
                <span className="mt-0.5">{formatBoxPlotTick(v)}</span>
              </span>
            ))}
          </div>
          <TrailingColumnSpacers />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-2 text-[11px] text-muted-foreground">
          <span>Parse</span>
          {LEGEND.map((tier) => (
            <span key={tier.floor} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: parseHexColor(tier.floor) }} />
              {tier.label}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}

/** Empty cells matching the row's trailing columns, so the axis lines up. */
function TrailingColumnSpacers() {
  return (
    <>
      {COLUMN_FLOORS.map((floor) => (
        <div key={floor} className="hidden w-14 shrink-0 md:block" />
      ))}
      <div className="w-14 shrink-0 md:hidden" />
      <div className="hidden w-12 shrink-0 sm:block" />
      <div className="hidden w-6 shrink-0 sm:block" />
    </>
  )
}

function SpreadRow({
  spread,
  scale,
  metricLabel,
  onClick,
  onHide,
}: {
  spread: ParseScoreSpread
  scale: SpreadScale
  metricLabel: string
  onClick: () => void
  onHide: () => void
}) {
  const pct = (v: number) => `${((Math.max(scale.min, v) - scale.min) / (scale.max - scale.min)) * 100}%`
  const color = CLASS_CSS_VAR[spread.player_class]
  const className = CLASS_DISPLAY[spread.player_class] ?? spread.player_class
  const specLabel = spreadSpecLabel(spread) || className
  const bands = spreadBands(spread)
  const scored = spread.status !== "sample_too_small"
  const value = (floor: number) => {
    const cutoff = spreadCutoff(spread, floor)
    return cutoff === null ? "—" : formatMetric(cutoff)
  }

  return (
    <div className="group flex items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-muted/20">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClick}
            className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
            aria-label={`${className} ${specLabel}: open spec details`}
          >
            <span className="flex w-24 shrink-0 items-center gap-1.5 text-xs sm:w-36">
              <img
                src={`/c/icons/class_${spread.player_class.toLowerCase()}.png`}
                alt=""
                className="h-4 w-4 shrink-0 rounded-sm"
                onError={(e) => { e.currentTarget.src = "/c/icons/class_unknown.png" }}
              />
              <span className="truncate font-medium" style={{ color }}>{specLabel}</span>
            </span>

            <span className={cn("relative h-5 flex-1", !scored && "opacity-40")}>
              {bands.map((band, i) => (
                <span
                  key={band.floor}
                  className={cn(
                    "absolute top-0.5 bottom-0.5",
                    i === 0 && band.start >= scale.min && "rounded-l",
                    i === bands.length - 1 && "rounded-r",
                    i < bands.length - 1 && "border-r-2 border-card",
                  )}
                  style={{
                    left: pct(band.start),
                    width: `calc(${pct(band.end)} - ${pct(band.start)})`,
                    backgroundColor: parseHexColor(scored ? band.floor : 0),
                    // The sub-25 tail (deaths, late joins) is context, not a target.
                    opacity: band.floor === 0 ? 0.35 : undefined,
                  }}
                />
              ))}
            </span>

            {COLUMN_FLOORS.map((floor) => (
              <span key={floor} className="hidden w-14 shrink-0 text-right font-mono text-xs tabular-nums text-foreground md:block">
                {value(floor)}
              </span>
            ))}
            <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-foreground md:hidden">{value(95)}</span>
            <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
              {spread.sample_size.toLocaleString()}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          sideOffset={6}
          hideArrow
          className="w-56 rounded-lg border border-white/10 bg-popover p-3 text-foreground shadow-lg"
        >
          <div className="mb-2 flex items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color }}>{className} · {specLabel}</span>
            <span className="ml-auto text-[10px] text-muted-foreground">{spread.sample_size.toLocaleString()} kills</span>
          </div>
          {scored ? (
            <div className="space-y-1 text-xs">
              {[100, 99, 95, 75, 50, 25].map((floor) => (
                <div key={floor} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: parseHexColor(floor) }} />
                    {floor === 100 ? "100" : `${floor}+`}
                  </span>
                  <span className="font-mono">{value(floor)} {metricLabel}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-white/5 pt-1 text-muted-foreground">
                <span>Median</span>
                <span className="font-mono">{formatMetric(spread.median)}</span>
              </div>
              {spread.status === "low_confidence" && (
                <p className="pt-1 text-[10px] text-muted-foreground">Few kills, so cutoffs may shift.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Too few kills to score parses yet.</p>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground">Click for spec details</p>
        </TooltipContent>
      </Tooltip>
      <button
        type="button"
        onClick={onHide}
        title={`Hide ${className} ${specLabel}`}
        aria-label={`Hide ${className} ${specLabel}`}
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 opacity-0 sm:flex transition-opacity hover:bg-white/5 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        <EyeOff className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
