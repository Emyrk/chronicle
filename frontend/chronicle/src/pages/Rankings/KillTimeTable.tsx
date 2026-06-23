import { ExternalLink } from "lucide-react"
import { Link } from "react-router-dom"
import type { KillTimeLeaderboardEntry } from "@/api/typesGenerated"

const MEDAL_ICONS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  const sWhole = Math.floor(s)
  const sFrac = s - sWhole
  const fracStr = sFrac > 0 ? `.${sFrac.toFixed(1).slice(2)}` : ""
  return `${m}:${String(sWhole).padStart(2, "0")}${fracStr}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

export interface RankedKillTimeEntry extends KillTimeLeaderboardEntry {
  rank: number
}

interface KillTimeTableProps {
  entries: RankedKillTimeEntry[]
}

export function KillTimeTable({ entries }: KillTimeTableProps) {
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
            key={`${entry.encounter_name}-${entry.killed_at}-${i}`}
            className={`flex items-center gap-3 px-4 py-3 ${i % 2 === 1 ? "bg-muted/20" : ""}`}
          >
            <div className="w-8 shrink-0 text-center">
              {MEDAL_ICONS[entry.rank] ?? (
                <span className="text-sm font-medium text-muted-foreground">{entry.rank}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="shrink-0 font-mono font-semibold">
                  {formatDuration(entry.duration_secs)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{entry.guild_name || "—"}</span>
                <span>{entry.realm_name}</span>
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
              <th className="px-4 py-3 text-right">Duration</th>
              <th className="px-4 py-3">Guild</th>
              <th className="px-4 py-3">Realm</th>
              <th className="px-4 py-3 text-right">Date</th>
              <th className="w-12 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={`${entry.encounter_name}-${entry.killed_at}-${i}`}
                className={`border-b last:border-b-0 transition-colors hover:bg-muted/40 ${
                  i % 2 === 1 ? "bg-muted/20" : ""
                }`}
              >
                <td className="px-4 py-3 text-center font-medium">
                  {MEDAL_ICONS[entry.rank] ?? (
                    <span className="text-muted-foreground">{entry.rank}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {formatDuration(entry.duration_secs)}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{entry.guild_name || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{entry.realm_name}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {formatDate(entry.killed_at)}
                </td>
                <td className="px-4 py-3 text-center">
                  {entry.log_hashed_slug && (
                    <Link
                      to={`/instances/${entry.log_hashed_slug}`}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      title="View instance"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
