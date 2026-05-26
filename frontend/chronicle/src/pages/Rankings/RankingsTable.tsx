import { ExternalLink } from "lucide-react"
import { Link } from "react-router-dom"
import type { RankingEntry } from "./mockData"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "./mockData"

const MEDAL_ICONS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

interface RankingsTableProps {
  entries: RankingEntry[]
}

export function RankingsTable({ entries }: RankingsTableProps) {
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
            key={`${entry.playerName}-${entry.date}-${i}`}
            className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
          >
            <div className="w-8 shrink-0 text-center">
              {MEDAL_ICONS[entry.rank] ?? (
                <span className="text-sm font-medium text-muted-foreground">{entry.rank}</span>
              )}
            </div>
            <span
              className="h-full w-0.5 shrink-0 self-stretch rounded-full"
              style={{ backgroundColor: CLASS_CSS_VAR[entry.className] }}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{entry.playerName}</span>
                <span className="shrink-0 font-mono font-semibold">
                  {entry.value.toLocaleString()}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: CLASS_CSS_VAR[entry.className] }}
                  />
                  {CLASS_DISPLAY[entry.className]}
                </span>
                <span>{entry.playerSpec}</span>
                <span>{entry.realmName}</span>
                <span className="font-mono">{formatDuration(entry.durationMs)}</span>
                <span className="ml-auto">{formatDate(entry.date)}</span>
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
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Spec</th>
              <th className="px-4 py-3 text-right">DPS</th>
              <th className="px-4 py-3 text-right">Duration</th>
              <th className="px-4 py-3">Guild</th>
              <th className="px-4 py-3 text-right">Date</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={`${entry.playerName}-${entry.date}-${i}`}
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
                      style={{ backgroundColor: CLASS_CSS_VAR[entry.className] }}
                    />
                    <span className="font-medium">{entry.playerName}</span>
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.realmName}</td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: CLASS_CSS_VAR[entry.className] }}
                    />
                    {CLASS_DISPLAY[entry.className]}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.playerSpec}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {entry.value.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                  {formatDuration(entry.durationMs)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.guildName}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {formatDate(entry.date)}
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    to={`/instances/${entry.instanceId}`}
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
