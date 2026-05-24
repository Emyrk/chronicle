import { cn } from "@/lib/utils"
import { type MetricType, METRIC_LABELS } from "./mockData"

const METRICS: MetricType[] = ["dps", "hps", "damage_done", "healing_done", "dispels", "interrupts"]

interface MetricTabsProps {
  value: MetricType
  onChange: (m: MetricType) => void
}

export function MetricTabs({ value, onChange }: MetricTabsProps) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
      {METRICS.map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
            value === m
              ? "bg-[#5F8FA6] text-white"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {METRIC_LABELS[m]}
        </button>
      ))}
    </div>
  )
}
