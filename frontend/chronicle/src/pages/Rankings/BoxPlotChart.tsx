import { useMemo } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip"
import type { RankingsBoxPlotStats } from "@/api/typesGenerated"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "./classDisplay"

// ── Box Plot Row ──────────────────────────────────────────────────────────

interface BoxPlotRowProps {
  stats: RankingsBoxPlotStats
  scaleMax: number
  onClick?: () => void
}

function BoxPlotRow({ stats, scaleMax, onClick }: BoxPlotRowProps) {
  const pct = (v: number) => `${(v / scaleMax) * 100}%`
  const color = CLASS_CSS_VAR[stats.player_class]
  const iqr = stats.q3_dps - stats.q1_dps
  const label = stats.player_spec
    ? `${CLASS_DISPLAY[stats.player_class]} - ${stats.player_spec}`
    : CLASS_DISPLAY[stats.player_class]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={`group flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/20 ${onClick ? "cursor-pointer" : "cursor-default"}`}
          onClick={onClick}
          role={onClick ? "button" : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick() } } : undefined}
        >
          {/* Class label */}
          <div className="flex w-32 shrink-0 items-center gap-1.5 text-xs">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate font-medium">{label}</span>
          </div>

          {/* Box plot */}
          <div className="relative flex-1 h-7">
            {/* Whisker line: min → max */}
            <div
              className="absolute top-1/2 h-px -translate-y-1/2"
              style={{
                left: pct(stats.min_dps),
                width: `calc(${pct(stats.max_dps)} - ${pct(stats.min_dps)})`,
                backgroundColor: color,
                opacity: 0.35,
              }}
            />

            {/* Whisker caps */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5"
              style={{ left: pct(stats.min_dps), backgroundColor: color, opacity: 0.4 }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5"
              style={{ left: pct(stats.max_dps), backgroundColor: color, opacity: 0.4 }}
            />

            {/* IQR box: Q1 → Q3 */}
            <div
              className="absolute top-1 bottom-1 rounded-sm"
              style={{
                left: pct(stats.q1_dps),
                width: `calc(${pct(stats.q3_dps)} - ${pct(stats.q1_dps)})`,
                backgroundColor: color,
                opacity: 0.3,
                border: `1px solid`,
                borderColor: color,
              }}
            />

            {/* Median line */}
            <div
              className="absolute top-0.5 bottom-0.5 w-0.5 rounded-full"
              style={{ left: pct(stats.median_dps), backgroundColor: color }}
            />
          </div>

          {/* Count + median value */}
          <div className="w-24 shrink-0 text-right text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {Math.round(stats.median_dps).toLocaleString()}
            </span>{" "}
            <span className="hidden sm:inline">({stats.count})</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        hideArrow
        className="bg-popover border border-white/10 rounded-lg shadow-lg p-3 text-foreground w-56"
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-semibold">{label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {stats.count.toLocaleString()} parses
          </span>
        </div>
        {/* Stats */}
        <div className="space-y-1 text-xs">
          <DpsStatLine label="Best" value={Math.round(stats.max_dps)} />
          <DpsStatLine label="Top 25%" value={Math.round(stats.q3_dps)} />
          <DpsStatLine label="Typical" value={Math.round(stats.median_dps)} highlight />
          <DpsStatLine label="Bottom 25%" value={Math.round(stats.q1_dps)} />
          <DpsStatLine label="Lowest" value={Math.round(stats.min_dps)} />
          <div className="border-t border-white/5 pt-1 mt-1">
            <DpsStatLine label="Spread" desc="IQR (Q3 − Q1)" value={Math.round(iqr)} />
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function DpsStatLine({ label, desc, value, highlight }: { label: string; desc?: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className={highlight ? "font-semibold text-foreground" : "text-foreground"}>{label}</span>
        {desc && <span className="text-[10px] text-muted-foreground/50 ml-1">{desc}</span>}
      </div>
      <span className={`font-mono shrink-0 ${highlight ? "font-semibold text-foreground" : "font-medium"}`}>
        {value.toLocaleString()}/s
      </span>
    </div>
  )
}

// ── Box Plot Chart ────────────────────────────────────────────────────────

interface BoxPlotChartProps {
  stats: RankingsBoxPlotStats[]
  title?: string
  onRowClick?: (playerClass: string, playerSpec: string) => void
}

export function BoxPlotChart({ stats, title = "DPS Distribution by Class", onRowClick }: BoxPlotChartProps) {
  const scaleMax = useMemo(() => {
    if (stats.length === 0) return 1200
    return Math.max(...stats.map((s) => s.max_dps))
  }, [stats])

  const ticks = useMemo(() => {
    const step = scaleMax <= 600 ? 100 : 200
    const result: number[] = []
    for (let v = 0; v <= scaleMax; v += step) result.push(v)
    if (result[result.length - 1] < scaleMax) {
      result.push(Math.ceil(scaleMax / step) * step)
    }
    const finalMax = result[result.length - 1]
    return { values: result, max: finalMax }
  }, [scaleMax])

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-5 text-sm font-medium text-muted-foreground">{title}</h3>

      {stats.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No data for the selected filters.
        </p>
      ) : (
        <TooltipProvider>
          <div className="space-y-1">
            {stats.map((s) => (
              <BoxPlotRow
                key={`${s.player_class}-${s.player_spec ?? ""}`}
                stats={s}
                scaleMax={ticks.max}
                onClick={onRowClick ? () => onRowClick(s.player_class, s.player_spec) : undefined}
              />
            ))}

            {/* X-axis ticks */}
            <div className="flex items-center gap-3 pt-2">
              <div className="w-32 shrink-0" />
              <div className="relative flex-1 h-5">
                {ticks.values.map((v) => {
                  const pct = (v / ticks.max) * 100
                  return (
                    <span
                      key={v}
                      className="absolute -translate-x-1/2 text-[10px] text-muted-foreground/60 font-mono"
                      style={{ left: `${pct}%` }}
                    >
                      {v.toLocaleString()}
                    </span>
                  )
                })}
              </div>
              <div className="w-24 shrink-0" />
            </div>
          </div>
        </TooltipProvider>
      )}
    </div>
  )
}
