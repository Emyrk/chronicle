import { Link, useNavigate } from "react-router-dom"
import { Users } from "lucide-react"
import type { SpeedrunLeaderboardEntry } from "../../api/typesGenerated"
import { navigateWithModifiers } from "@/lib/navigation"

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
}

const MEDAL_ICONS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

interface LeaderboardTableProps {
  entries: SpeedrunLeaderboardEntry[]
  startRank: number
  className?: string
}

export function LeaderboardTable({ entries, startRank, className }: LeaderboardTableProps) {
  const navigate = useNavigate()
  return (
    <div className={className ?? ""}>
      {/* Mobile: 2-line card rows */}
      <div className="md:hidden divide-y border-y">
        {entries.map((entry, i) => {
          const rank = startRank + i
          return (
            <Link
              key={entry.instance_id}
              to={`/instances/${entry.slug || entry.instance_id}`}
              className={`flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors ${
                i % 2 === 1 ? "bg-muted/20" : ""
              }`}
            >
              <div className="w-8 text-center text-base shrink-0">
                {MEDAL_ICONS[rank] ?? (
                  <span className="text-sm text-muted-foreground font-medium">{rank}</span>
                )}
              </div>
              {entry.guild_logo_url && (
                <img src={entry.guild_logo_url} alt="" className="h-8 w-8 rounded-full object-cover shrink-0 self-center" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">
                    {entry.guild_name || "Unknown Guild"}
                  </span>
                  <span className="font-mono font-semibold shrink-0">
                    {formatDuration(entry.duration_ms)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {entry.player_count}
                  </span>
                  <span>{entry.realm_name}</span>
                  <span className="ml-auto">{formatDate(entry.completion_time)}</span>
                </div>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Desktop: full table */}
      <div className="hidden md:block rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground text-left">
              <th className="px-4 py-3 w-16 text-center">Rank</th>
              <th className="px-4 py-3">Guild</th>
              <th className="px-4 py-3 text-center">Players</th>
              <th className="px-4 py-3 text-right">Duration</th>
              <th className="px-4 py-3">Realm</th>
              <th className="px-4 py-3 text-right">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => {
              const rank = startRank + i
              return (
                <tr
                  key={entry.instance_id}
                  className={`border-b last:border-b-0 hover:bg-muted/40 transition-colors cursor-pointer ${
                    i % 2 === 1 ? "bg-muted/20" : ""
                  }`}
                  onClick={(event) => {
                    navigateWithModifiers(`/instances/${entry.slug || entry.instance_id}`, event, navigate)
                  }}
                  onAuxClick={(event) => {
                    navigateWithModifiers(`/instances/${entry.slug || entry.instance_id}`, event, navigate)
                  }}
                >
                  <td className="px-4 py-3 text-center font-medium">
                    {MEDAL_ICONS[rank] ?? (
                      <span className="text-muted-foreground">{rank}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {entry.guild_logo_url && (
                        <img src={entry.guild_logo_url} alt="" className="h-5 w-5 rounded-full object-cover shrink-0" />
                      )}
                      {entry.guild_name || "Unknown Guild"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      {entry.player_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-medium">
                    {formatDuration(entry.duration_ms)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {entry.realm_name}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {formatDate(entry.completion_time)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
