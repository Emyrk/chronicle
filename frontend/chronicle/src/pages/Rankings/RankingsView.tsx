import { useMemo, useState } from "react"
import { ArrowLeft, Skull } from "lucide-react"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import {
  type MetricType,
  type BossInfo,
  getRankings,
  getRankingSummary,
  getClassAverages,
} from "./mockData"
import { MetricTabs } from "./MetricTabs"
import { RankingsFilters } from "./RankingsFilters"
import { type TimePeriod, getTimePeriodDays } from "./timePeriod"
import { RankingsSummaryCards } from "./RankingsSummaryCards"
import { RankingsTable } from "./RankingsTable"
import { ClassBreakdownChart } from "./ClassBreakdownChart"

interface RankingsViewProps {
  boss: BossInfo
  metric: MetricType
  onMetricChange: (m: MetricType) => void
  selectedClasses: Set<WoWHeroClasses>
  onToggleClass: (cls: WoWHeroClasses) => void
  timePeriod: TimePeriod
  onTimePeriodChange: (p: TimePeriod) => void
  onBack: () => void
}

export function RankingsView({
  boss,
  metric,
  onMetricChange,
  selectedClasses,
  onToggleClass,
  timePeriod,
  onTimePeriodChange,
  onBack,
}: RankingsViewProps) {
  // Get raw entries for this boss + metric
  const allEntries = useMemo(() => getRankings(boss.id, metric), [boss.id, metric])

  // Snapshot "now" once at mount so time-period filtering is stable across re-renders
  const [now] = useState(() => Date.now())

  // Apply filters
  const filtered = useMemo(() => {
    let entries = allEntries

    // Class filter
    if (selectedClasses.size > 0) {
      entries = entries.filter((e) => selectedClasses.has(e.className))
    }

    // Time period filter
    const days = getTimePeriodDays(timePeriod)
    if (days !== null) {
      const cutoff = now - days * 86400000
      entries = entries.filter((e) => new Date(e.date).getTime() >= cutoff)
    }

    // Re-rank after filtering
    return entries.map((e, i) => ({ ...e, rank: i + 1 }))
  }, [allEntries, selectedClasses, timePeriod, now])

  const summary = useMemo(() => getRankingSummary(filtered), [filtered])
  const classAverages = useMemo(() => getClassAverages(filtered), [filtered])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to boss browser
        </button>
        <div className="flex items-center gap-3">
          <Skull className="h-6 w-6 text-[#5F8FA6]" />
          <div>
            <h1 className="text-xl font-bold">{boss.name}</h1>
            <p className="text-sm text-muted-foreground">
              {boss.instanceName} · {boss.totalKills} recorded kills
            </p>
          </div>
        </div>
      </div>

      {/* Metric tabs */}
      <MetricTabs value={metric} onChange={onMetricChange} />

      {/* Summary cards */}
      <RankingsSummaryCards summary={summary} metric={metric} />

      {/* Filters */}
      <RankingsFilters
        selectedClasses={selectedClasses}
        onToggleClass={onToggleClass}
        timePeriod={timePeriod}
        onTimePeriodChange={onTimePeriodChange}
      />

      {/* Rankings table */}
      <RankingsTable entries={filtered} metric={metric} />

      {/* Class breakdown chart */}
      <ClassBreakdownChart averages={classAverages} metric={metric} />
    </div>
  )
}
