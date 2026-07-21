import { ExternalLink } from "lucide-react"
import { Link } from "react-router-dom"
import type { RankingsEntry } from "@/api/typesGenerated"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "./classDisplay"

const MEDAL_ICONS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60)
  return `${minutes}:${String(secs).padStart(2, "0")}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export interface RankedEntry extends RankingsEntry {
  rank: number
}

interface RankingsTableProps {
  entries: RankedEntry[]
  metric?: "dps" | "hps"
}

function metricValue(entry: RankedEntry, metric: "dps" | "hps"): number {
  return metric === "hps" ? entry.hps : entry.dps
}

function metricTitle(entry: RankedEntry, metric: "dps" | "hps"): string | undefined {
  if (metric !== "hps") return undefined
  const total = entry.healing_done + entry.absorbed_done
  return `Effective healing: ${entry.healing_done.toLocaleString()} · Absorbed: ${entry.absorbed_done.toLocaleString()} · Total: ${total.toLocaleString()}`
}

export function RankingsTable({ entries, metric = "dps" }: RankingsTableProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-muted-foreground">
        No records found for the current filters.
      </div>
    )
  }

  return (
    <>
      {/* Mobile card rows */}
      <div className="md:hidden divide-y border-y">
        {entries.map((entry, i) => (
          <div
            key={`${entry.player_name}-${entry.killed_at}-${i}`}
            className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
          >
            <div className="w-8 shrink-0 text-center">
              {MEDAL_ICONS[entry.rank] ?? (
                <span className="text-sm font-medium text-muted-foreground">{entry.rank}</span>
              )}
            </div>
            <img
              src={`/c/icons/class_${entry.player_class.toLowerCase()}.png`}
              alt={CLASS_DISPLAY[entry.player_class] ?? entry.player_class}
              className="h-5 w-5 shrink-0 rounded-sm"
              onError={(e) => { e.currentTarget.src = "/c/icons/class_unknown.png" }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{entry.player_name}</span>
                <span className="shrink-0 font-mono font-semibold" title={metricTitle(entry, metric)}>
                  {Math.round(metricValue(entry, metric)).toLocaleString()}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span style={{ color: CLASS_CSS_VAR[entry.player_class] }}>{entry.player_spec}</span>
                <span>{entry.realm_name}</span>
                <span className="font-mono">{formatDuration(entry.duration_secs)}</span>
                <span className="ml-auto">{formatDate(entry.killed_at)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-muted-foreground">
              <th className="w-16 px-4 py-3 text-center">Rank</th>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Realm</th>
              <th className="px-4 py-3">Spec</th>
              <th className="px-4 py-3 text-right">{metric === "hps" ? "HPS" : "DPS"}</th>
              <th className="px-4 py-3 text-right">Duration</th>
              <th className="px-4 py-3">Guild</th>
              <th className="px-4 py-3 text-right">Date</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={`${entry.player_name}-${entry.killed_at}-${i}`}
                className={`border-b last:border-b-0 transition-colors hover:bg-muted/40 ${
                  i % 2 === 1 ? "bg-muted/20" : ""
                }`}
              >
                <td className="px-4 py-3 text-center font-medium">
                  {MEDAL_ICONS[entry.rank] ?? (
                    <span className="text-muted-foreground">{entry.rank}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-0.5 rounded-full"
                      style={{ backgroundColor: CLASS_CSS_VAR[entry.player_class] }}
                    />
                    <span className="font-medium">{entry.player_name}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.realm_name}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <img
                      src={`/c/icons/class_${entry.player_class.toLowerCase()}.png`}
                      alt={CLASS_DISPLAY[entry.player_class] ?? entry.player_class}
                      className="h-4 w-4 shrink-0 rounded-sm"
                      onError={(e) => { e.currentTarget.src = "/c/icons/class_unknown.png" }}
                    />
                    <span style={{ color: CLASS_CSS_VAR[entry.player_class] }}>{entry.player_spec}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold" title={metricTitle(entry, metric)}>
                  {Math.round(metricValue(entry, metric)).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                  {formatDuration(entry.duration_secs)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.guild_name}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {formatDate(entry.killed_at)}
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    to={`/instances/${entry.log_hashed_slug}`}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    title="View instance"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
