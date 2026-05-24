import { Crown, TrendingUp, Hash, Users } from "lucide-react"
import type { RankingSummary } from "./mockData"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "./mockData"

interface RankingsSummaryCardsProps {
  summary: RankingSummary
}

export function RankingsSummaryCards({ summary }: RankingsSummaryCardsProps) {
  const cards = [
    {
      label: "Record DPS",
      value: summary.record.value.toLocaleString(),
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
