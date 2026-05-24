import type { ClassAverage, MetricType } from "./mockData"
import { CLASS_CSS_VAR, CLASS_DISPLAY, METRIC_LABELS } from "./mockData"

interface ClassBreakdownChartProps {
  averages: ClassAverage[]
  metric: MetricType
}

export function ClassBreakdownChart({ averages, metric }: ClassBreakdownChartProps) {
  if (averages.length === 0) return null

  const maxValue = Math.max(...averages.map((a) => a.average))

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        Average {METRIC_LABELS[metric]} by Class
      </h3>
      <div className="space-y-2.5">
        {averages.map((avg) => {
          const pct = maxValue > 0 ? (avg.average / maxValue) * 100 : 0
          return (
            <div key={avg.className} className="flex items-center gap-3">
              <div className="flex w-20 shrink-0 items-center gap-1.5 text-xs">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: CLASS_CSS_VAR[avg.className] }}
                />
                <span className="truncate">{CLASS_DISPLAY[avg.className]}</span>
              </div>
              <div className="flex-1">
                <div className="h-5 w-full overflow-hidden rounded-sm bg-muted/30">
                  <div
                    className="h-full rounded-sm transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: CLASS_CSS_VAR[avg.className],
                      opacity: 0.7,
                    }}
                  />
                </div>
              </div>
              <div className="flex w-28 shrink-0 items-center justify-end gap-2 text-xs">
                <span className="font-mono font-semibold">{avg.average.toLocaleString()}</span>
                <span className="text-muted-foreground">({avg.count})</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
