import { useMemo, useState } from "react"
import { Trophy } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import {
  getAllEntries,
  computeBoxPlotStats,
  INSTANCES,
  INSTANCE_NAMES,
  CLASS_CSS_VAR,
  CLASS_DISPLAY,
  ALL_DPS_CLASSES,
} from "./mockData"
import type { TimePeriod } from "./timePeriod"
import { getTimePeriodDays } from "./timePeriod"
import { BoxPlotChart } from "./BoxPlotChart"

// ── Filters (inline — small enough not to warrant a separate file) ────────

const TIME_OPTIONS: { value: TimePeriod; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "90d", label: "90 Days" },
  { value: "30d", label: "30 Days" },
  { value: "7d", label: "7 Days" },
]

// ── Component ─────────────────────────────────────────────────────────────

interface DpsOverviewProps {
  instance: string | null
  onInstanceChange: (v: string | null) => void
  timePeriod: TimePeriod
  onTimePeriodChange: (p: TimePeriod) => void
  selectedClasses: Set<WoWHeroClasses>
  onToggleClass: (cls: WoWHeroClasses) => void
  onSelectBoss: (bossId: string) => void
  onSelectInstance: (name: string) => void
}

export function DpsOverview({
  instance,
  onInstanceChange,
  timePeriod,
  onTimePeriodChange,
  selectedClasses,
  onToggleClass,
  onSelectBoss,
  onSelectInstance,
}: DpsOverviewProps) {
  const [now] = useState(() => Date.now())

  const stats = useMemo(() => {
    let entries = getAllEntries(instance ?? undefined)

    // Time filter
    const days = getTimePeriodDays(timePeriod)
    if (days !== null) {
      const cutoff = now - days * 86400000
      entries = entries.filter((e) => new Date(e.date).getTime() >= cutoff)
    }

    return computeBoxPlotStats(entries)
  }, [instance, timePeriod, now])

  // Filter to selected classes (or show all)
  const visible = useMemo(() => {
    if (selectedClasses.size === 0) return stats
    return stats.filter((s) => selectedClasses.has(s.className))
  }, [stats, selectedClasses])

  const totalRecords = useMemo(
    () => visible.reduce((s, v) => s + v.count, 0),
    [visible],
  )

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div className="text-center">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Trophy className="h-6 w-6 text-[#5F8FA6]" />
          <h1 className="text-2xl font-bold">DPS Rankings</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          DPS distribution by class across{" "}
          {totalRecords.toLocaleString()} recorded boss encounters
        </p>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Instance selector */}
        <select
          value={instance ?? ""}
          onChange={(e) => onInstanceChange(e.target.value || null)}
          className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-sm text-foreground"
        >
          <option value="">All Instances</option>
          {INSTANCE_NAMES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>

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

      {/* Class toggles */}
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

      {/* Box plot chart */}
      <BoxPlotChart stats={visible} />

      {/* Browse by boss */}
      <div className="rounded-xl border bg-card p-5">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          Browse by Boss
        </h3>
        <div className="space-y-4">
          {INSTANCES.map((inst) => (
            <div key={inst.name}>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-medium text-muted-foreground/70 uppercase tracking-wide">
                  {inst.name}
                </h4>
                <button
                  onClick={() => onSelectInstance(inst.name)}
                  className="text-xs text-[#5F8FA6] hover:text-[#5F8FA6]/80 font-medium transition-colors"
                >
                  View Instance →
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {inst.bosses.map((boss) => (
                  <button
                    key={boss.id}
                    onClick={() => onSelectBoss(boss.id)}
                    className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium transition-colors hover:bg-[#5F8FA6]/20 hover:border-[#5F8FA6]/40"
                  >
                    {boss.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
