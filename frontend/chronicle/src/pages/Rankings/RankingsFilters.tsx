import { cn } from "@/lib/utils"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import { ALL_DPS_CLASSES, CLASS_CSS_VAR, CLASS_DISPLAY } from "./mockData"
import type { TimePeriod } from "./timePeriod"

const TIME_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "90d", label: "90 Days" },
  { value: "30d", label: "30 Days" },
  { value: "7d", label: "7 Days" },
]

interface RankingsFiltersProps {
  selectedClasses: Set<WoWHeroClasses>
  onToggleClass: (cls: WoWHeroClasses) => void
  timePeriod: TimePeriod
  onTimePeriodChange: (p: TimePeriod) => void
}

export function RankingsFilters({
  selectedClasses,
  onToggleClass,
  timePeriod,
  onTimePeriodChange,
}: RankingsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Class filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-muted-foreground">Class:</span>
        {ALL_DPS_CLASSES.map((cls) => {
          const active = selectedClasses.size === 0 || selectedClasses.has(cls)
          return (
            <button
              key={cls}
              onClick={() => onToggleClass(cls)}
              title={CLASS_DISPLAY[cls]}
              className={cn(
                "flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium transition-all",
                active
                  ? "border-white/20 bg-white/5"
                  : "border-transparent opacity-30 hover:opacity-60",
              )}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CLASS_CSS_VAR[cls] }}
              />
              <span className="hidden sm:inline">{CLASS_DISPLAY[cls]}</span>
            </button>
          )
        })}
      </div>

      {/* Time period */}
      <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
        {TIME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onTimePeriodChange(opt.value)}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              timePeriod === opt.value
                ? "bg-[#5F8FA6] text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}


