import { Users } from "lucide-react"
import { Podium } from "@/pages/Leaderboard/Podium"
import { formatClock, speedruns } from "./hub.fixtures"
import type { EncounterSelection } from "./encounterSelection"

/**
 * Speedruns, its own tab: guilds ranked by time. Follows the encounter
 * selection: full clears, one boss's kills, or total kill time over a set.
 */
export function SpeedrunsTab({
  instanceName,
  bosses,
  selection,
}: {
  instanceName: string
  bosses: readonly string[]
  selection: EncounterSelection
}) {
  const set = selection.kind === "bosses" ? selection.bosses : undefined
  const runs = speedruns(set, bosses, instanceName)
  const what = !set ? "Fastest full clears" : set.length === 1 ? `Fastest ${set[0]} kills` : `Fastest total kill time · ${set.length} bosses`
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-xl border bg-card px-4 pt-10">
        <span className="absolute top-3 left-4 text-xs font-medium text-muted-foreground">{what}</span>
        <Podium entries={runs.slice(0, 3)} instanceName={instanceName} />
      </section>
      <section aria-label={what} className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="w-12 px-4 py-2 text-left font-medium">#</th>
              <th className="px-2 py-2 text-left font-medium">Guild</th>
              <th className="px-2 py-2 text-right font-medium">Time</th>
              <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">Players</th>
              <th className="hidden px-2 py-2 text-left font-medium md:table-cell">Realm</th>
              <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={r.instance_id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[.03]">
                <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2 font-medium">
                  {/* Same treatment as today's speedrun table: the guild's logo, when it has one, left of the name. */}
                  <span className="flex min-w-0 items-center gap-2">
                    {r.guild_logo_url ? (
                      <img src={r.guild_logo_url} alt="" className="size-5 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="size-5 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{r.guild_name}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">{formatClock(r.duration_ms)}</td>
                <td className="hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3" />
                    {r.player_count}
                  </span>
                </td>
                <td className="hidden px-2 py-2 text-muted-foreground md:table-cell">{r.realm_name}</td>
                <td className="hidden px-4 py-2 text-right text-muted-foreground sm:table-cell">
                  {new Date(r.completion_time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
