import { Crown, TrendingUp, Hash, Users } from "lucide-react"
import type { RankingSummary, MetricType } from "./mockData"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "./mockData"

function formatValue(value: number, metric: MetricType): string {
  if (metric === "damage_done" || metric === "healing_done") {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  }
  return value.toLocaleString()
}

interface RankingsSummaryCardsProps {
  summary: RankingSummary
  metric: MetricType
}

export function RankingsSummaryCards({ summary, metric }: RankingsSummaryCardsProps) {
  const cards = [
    {
      label: "Record",
      value: formatValue(summary.record.value, metric),
      sub: (
        <span className="flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: CLASS_CSS_VAR[summary.record.className] }}
          />
          {summary.record.playerName}
          <span className="text-muted-foreground">
            ({CLASS_DISPLAY[summary.record.className]})
          </span>
        </span>
      ),
      icon: Crown,
    },
    {
      label: "Median",
      value: formatValue(summary.median, metric),
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
      label: "Classes",
      value: summary.classCount.toString(),
      sub: "Unique classes represented",
      icon: Users,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-xl border bg-card p-4"
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <c.icon className="h-3.5 w-3.5" />
            {c.label}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold">{c.value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{c.sub}</div>
        </div>
      ))}
    </div>
  )
}
