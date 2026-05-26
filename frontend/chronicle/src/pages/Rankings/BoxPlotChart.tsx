import { useMemo } from "react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip"
import type { BoxPlotStats } from "./mockData"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "./mockData"

// ── Box Plot Row ──────────────────────────────────────────────────────────

interface BoxPlotRowProps {
  stats: BoxPlotStats
  scaleMax: number
}

function BoxPlotRow({ stats, scaleMax }: BoxPlotRowProps) {
  const pct = (v: number) => `${(v / scaleMax) * 100}%`
  const color = CLASS_CSS_VAR[stats.className]
  const iqr = stats.q3 - stats.q1
  const label = stats.specName
    ? `${CLASS_DISPLAY[stats.className]} - ${stats.specName}`
    : CLASS_DISPLAY[stats.className]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="group flex items-center gap-3 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/20 cursor-default">
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
                left: pct(stats.min),
                width: `calc(${pct(stats.max)} - ${pct(stats.min)})`,
                backgroundColor: color,
                opacity: 0.35,
              }}
            />

            {/* Whisker caps */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5"
              style={{ left: pct(stats.min), backgroundColor: color, opacity: 0.4 }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-px h-2.5"
              style={{ left: pct(stats.max), backgroundColor: color, opacity: 0.4 }}
            />

            {/* IQR box: Q1 → Q3 */}
            <div
              className="absolute top-1 bottom-1 rounded-sm"
              style={{
                left: pct(stats.q1),
                width: `calc(${pct(stats.q3)} - ${pct(stats.q1)})`,
                backgroundColor: color,
                opacity: 0.3,
                border: `1px solid`,
                borderColor: color,
              }}
            />

            {/* Median line */}
            <div
              className="absolute top-0.5 bottom-0.5 w-0.5 rounded-full"
              style={{ left: pct(stats.median), backgroundColor: color }}
            />
          </div>

          {/* Count + median value */}
          <div className="w-24 shrink-0 text-right text-xs text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {stats.median.toLocaleString()}
            </span>{" "}
            <span className="hidden sm:inline">({stats.count})</span>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        hideArrow
        className="bg-popover border border-white/10 rounded-lg shadow-lg p-3 text-foreground w-52"
      >
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-xs font-semibold">{label}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {stats.count.toLocaleString()} records
          </span>
        </div>
        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <StatLine label="Max" value={stats.max} />
          <StatLine label="Q3" value={stats.q3} />
          <StatLine label="Median" value={stats.median} />
          <StatLine label="Q1" value={stats.q1} />
          <StatLine label="Min" value={stats.min} />
          <StatLine label="IQR" value={iqr} />
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

function StatLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value.toLocaleString()}</span>
    </div>
  )
}

// ── Box Plot Chart ────────────────────────────────────────────────────────

interface BoxPlotChartProps {
  stats: BoxPlotStats[]
  title?: string
}

export function BoxPlotChart({ stats, title = "DPS Distribution by Class" }: BoxPlotChartProps) {
  const scaleMax = useMemo(() => {
    if (stats.length === 0) return 1200
    return Math.max(...stats.map((s) => s.max))
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
              <BoxPlotRow key={`${s.className}-${s.specName ?? ""}`} stats={s} scaleMax={ticks.max} />
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
