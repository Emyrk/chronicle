import { useMemo, useState } from "react"
import { ArrowLeft, Crown, Hash, Skull, Swords, TrendingUp } from "lucide-react"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import {
  type InstanceInfo,
  getAllEntries,
  getTopEntries,
  computeBoxPlotStats,
  CLASS_CSS_VAR,
  CLASS_DISPLAY,
} from "./mockData"
import type { TimePeriod } from "./timePeriod"
import { getTimePeriodDays } from "./timePeriod"
import { RankingsFilters } from "./RankingsFilters"
import { BoxPlotChart } from "./BoxPlotChart"

// ── Component ─────────────────────────────────────────────────────────────

interface InstanceViewProps {
  instance: InstanceInfo
  timePeriod: TimePeriod
  onTimePeriodChange: (p: TimePeriod) => void
  selectedClasses: Set<WoWHeroClasses>
  onToggleClass: (cls: WoWHeroClasses) => void
  onSelectBoss: (bossId: string) => void
  onBack: () => void
}

const MEDALS = ["🥇", "🥈", "🥉"]

function formatDuration(ms: number): string {
  const dur = Math.round(ms / 1000)
  const m = Math.floor(dur / 60)
  const s = dur % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function InstanceView({
  instance,
  timePeriod,
  onTimePeriodChange,
  selectedClasses,
  onToggleClass,
  onSelectBoss,
  onBack,
}: InstanceViewProps) {
  const [now] = useState(() => Date.now())

  // All entries for this instance, filtered by time period
  const filteredEntries = useMemo(() => {
    let entries = getAllEntries(instance.name)
    const days = getTimePeriodDays(timePeriod)
    if (days !== null) {
      const cutoff = now - days * 86400000
      entries = entries.filter((e) => new Date(e.date).getTime() >= cutoff)
    }
    if (selectedClasses.size > 0) {
      entries = entries.filter((e) => selectedClasses.has(e.className))
    }
    return entries
  }, [instance.name, timePeriod, selectedClasses, now])

  // Box plot stats
  const boxPlotStats = useMemo(
    () => computeBoxPlotStats(filteredEntries),
    [filteredEntries],
  )

  // Summary values
  const summary = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => b.value - a.value)
    const top = sorted[0]

    let median = 0
    if (sorted.length > 0) {
      const mid = Math.floor(sorted.length / 2)
      median =
        sorted.length % 2 === 0
          ? Math.round((sorted[mid - 1].value + sorted[mid].value) / 2)
          : sorted[mid].value
    }

    return {
      record: top ?? null,
      median,
      totalRecords: sorted.length,
      bossCount: instance.bosses.length,
    }
  }, [filteredEntries, instance.bosses.length])

  const summaryCards = [
    {
      label: "Record DPS",
      value: summary.record ? summary.record.value.toLocaleString() : "—",
      sub: summary.record ? (
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CLASS_CSS_VAR[summary.record.className] }}
          />
          {summary.record.playerName}
        </span>
      ) : (
        "No records"
      ),
      icon: Crown,
    },
    {
      label: "Median DPS",
      value: summary.median.toLocaleString(),
      sub: "Across all records",
      icon: TrendingUp,
    },
    {
      label: "Total Records",
      value: summary.totalRecords.toLocaleString(),
      sub: "Recorded performances",
      icon: Hash,
    },
    {
      label: "Bosses",
      value: summary.bossCount.toString(),
      sub: "Boss encounters",
      icon: Swords,
    },
  ]

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Header */}
      <div>
        <button
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Overview
        </button>
        <div className="flex items-center gap-2">
          <Skull className="h-6 w-6 text-[#5F8FA6]" />
          <h1 className="text-2xl font-bold">{instance.name}</h1>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <c.icon className="h-3.5 w-3.5" />
              {c.label}
            </div>
            <div className="mt-1 font-mono text-xl font-semibold">{c.value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <RankingsFilters
        selectedClasses={selectedClasses}
        onToggleClass={onToggleClass}
        timePeriod={timePeriod}
        onTimePeriodChange={onTimePeriodChange}
      />

      {/* Box plot */}
      <BoxPlotChart stats={boxPlotStats} />

      {/* Boss top-5 cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {instance.bosses.map((boss) => (
          <BossTopCard
            key={boss.id}
            bossName={boss.name}
            bossId={boss.id}
            timePeriod={timePeriod}
            selectedClasses={selectedClasses}
            now={now}
            onViewAll={() => onSelectBoss(boss.id)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Boss Top-5 Card ───────────────────────────────────────────────────────

interface BossTopCardProps {
  bossName: string
  bossId: string
  timePeriod: TimePeriod
  selectedClasses: Set<WoWHeroClasses>
  now: number
  onViewAll: () => void
}

function BossTopCard({
  bossName,
  bossId,
  timePeriod,
  selectedClasses,
  now,
  onViewAll,
}: BossTopCardProps) {
  const entries = useMemo(() => {
    let all = getTopEntries(bossId, 50) // get more then filter
    const days = getTimePeriodDays(timePeriod)
    if (days !== null) {
      const cutoff = now - days * 86400000
      all = all.filter((e) => new Date(e.date).getTime() >= cutoff)
    }
    if (selectedClasses.size > 0) {
      all = all.filter((e) => selectedClasses.has(e.className))
    }
    return all.slice(0, 5)
  }, [bossId, timePeriod, selectedClasses, now])

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <span className="font-medium text-sm">{bossName}</span>
        <button
          onClick={onViewAll}
          className="text-xs text-[#5F8FA6] hover:text-[#5F8FA6]/80 font-medium transition-colors"
        >
          View All →
        </button>
      </div>

      {/* Rows */}
      {entries.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          No records for current filters.
        </p>
      ) : (
        <div>
          {entries.map((entry, i) => (
            <div
              key={`${entry.playerName}-${entry.value}`}
              className={`flex items-center gap-3 px-4 py-2 ${i % 2 === 0 ? "bg-muted/10" : ""}`}
            >
              {/* Rank */}
              <span className="w-6 shrink-0 text-center text-sm">
                {i < 3 ? MEDALS[i] : i + 1}
              </span>
              {/* Player name */}
              <span className="flex-1 truncate text-sm font-medium">{entry.playerName}</span>
              {/* Class */}
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: CLASS_CSS_VAR[entry.className] }}
                />
                {CLASS_DISPLAY[entry.className]}
              </span>
              {/* DPS value */}
              <span className="font-mono text-sm font-semibold">
                {entry.value.toLocaleString()}
              </span>
              {/* Duration */}
              <span className="text-xs text-muted-foreground">
                {formatDuration(entry.durationMs)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
