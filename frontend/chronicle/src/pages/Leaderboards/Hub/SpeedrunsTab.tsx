import { useState } from "react"
import { Timer, Users } from "lucide-react"
import type { KillTimeLeaderboardEntry, SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { guildAttributes, killAttributes, speedrunClearAttributes } from "@/components/EntityMenu/leaderboardEntities"
import { Podium } from "@/pages/Leaderboard/Podium"
import { formatClock, speedruns } from "./hub.fixtures"
import { defaultSpeedrunsView, selectedBosses, type EncounterSelection, type SpeedrunsView } from "./encounterSelection"

type LiveList<T> = { entries?: readonly T[]; loading?: boolean; error?: Error | null }

/**
 * Speedruns, its own tab, with two boards: full clears (whole-raid runs) and
 * kill times (each selected boss's fastest kills). The preset opens on full
 * clears; a hand-picked set opens on its bosses' kill times.
 */
export function SpeedrunsTab({
  instanceName,
  bosses,
  selection,
  view: controlledView,
  onView,
  live,
}: {
  instanceName: string
  bosses: readonly string[]
  selection: EncounterSelection
  /** Controlled view, so a host only loads the board that is shown. */
  view?: SpeedrunsView
  onView?: (view: SpeedrunsView) => void
  /** When provided, use only parent-loaded API results, never story fixtures. */
  live?: { clears?: LiveList<SpeedrunLeaderboardEntry>; kills?: LiveList<KillTimeLeaderboardEntry> }
}) {
  const [ownView, setOwnView] = useState<SpeedrunsView>(defaultSpeedrunsView(selection))
  const view = controlledView ?? ownView
  const setView = onView ?? setOwnView
  const chosen = selectedBosses(selection, bosses)
  return (
    <div className="space-y-5">
      <nav aria-label="Speedrun board" className="inline-flex rounded-md border bg-card p-0.5 text-sm">
        {(
          [
            ["clear", "Full clear"],
            ["kills", `Kill times${chosen.length ? ` · ${chosen.length === 1 ? chosen[0] : `${chosen.length} bosses`}` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => setView(id)}
            className={cn(
              "cursor-pointer rounded px-3 py-1.5 font-medium transition-colors",
              view === id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === "clear" ? (
        <ClearBoard instanceName={instanceName} live={live?.clears} story={!live} bosses={bosses} />
      ) : (
        <KillTimes instanceName={instanceName} bosses={chosen} allBosses={bosses} live={live?.kills} story={!live} />
      )}
    </div>
  )
}

function Status({ children, alert }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? "alert" : "status"} className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
      {children}
    </div>
  )
}

/** Each selected boss's fastest kills, a card per boss (one boss gets a longer list). */
function KillTimes({
  instanceName,
  bosses,
  allBosses,
  live,
  story,
}: {
  instanceName: string
  bosses: readonly string[]
  allBosses: readonly string[]
  live?: LiveList<KillTimeLeaderboardEntry>
  story: boolean
}) {
  if (live?.error) return <Status alert>Could not load kill times: {live.error.message}</Status>
  if (!story && (live?.loading || !live?.entries)) return <Status>Loading kill times…</Status>
  const limit = bosses.length === 1 ? 10 : 3
  const rows = (boss: string): { key: string; guild: string; guildId?: string; ms: number; date: string; realm: string; entry?: KillTimeLeaderboardEntry }[] =>
    story
      ? speedruns([boss], allBosses, instanceName, limit).map((r) => ({ key: r.instance_id, guild: r.guild_name, ms: r.duration_ms, date: r.completion_time, realm: r.realm_name }))
      : (live?.entries ?? [])
          .filter((e) => e.encounter_name === boss)
          .slice(0, limit)
          .map((e) => ({ key: e.encounter_id, guild: e.guild_name, guildId: e.guild_id, ms: Math.round(e.duration_secs * 1000), date: e.killed_at, realm: e.realm_name, entry: e }))
  return (
    <section aria-label="Kill times" className={cn("grid gap-4", bosses.length > 1 && "sm:grid-cols-2 xl:grid-cols-3")}>
      {bosses.map((boss) => {
        const list = rows(boss)
        return (
          <div key={boss} className="overflow-hidden rounded-xl border bg-card">
            <h3 className="flex items-center gap-2 border-b bg-black/10 px-4 py-2.5 text-sm font-semibold">
              <Timer className="size-4 text-muted-foreground" />
              {boss}
            </h3>
            {list.length ? (
              <ol>
                {list.map((r, i) => (
                  <li key={r.key} className="flex items-center gap-3 border-b border-white/5 px-4 py-2 text-sm last:border-b-0">
                    <span className="w-4 font-mono text-xs text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-amber-500" {...guildAttributes(r.guildId, r.guild)}>
                      &lt;{r.guild || "Unknown guild"}&gt;
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">{r.realm}</span>
                    <span className="font-mono tabular-nums" {...(r.entry ? killAttributes(r.entry) : {})}>{formatClock(r.ms)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">No clean kills yet</p>
            )}
          </div>
        )
      })}
    </section>
  )
}

/** Fastest full clears: the podium and the table below it. */
function ClearBoard({ instanceName, bosses, live, story }: { instanceName: string; bosses: readonly string[]; live?: LiveList<SpeedrunLeaderboardEntry>; story: boolean }) {
  const runs = story ? speedruns(undefined, bosses, instanceName) : (live?.entries ?? [])
  const what = "Fastest full clears"
  if (live?.error) return <Status alert>Could not load speedruns: {live.error.message}</Status>
  if (!story && (live?.loading || !live?.entries)) return <Status>Loading speedruns…</Status>
  if (!story && runs.length === 0) return <Status>No speedruns found for the current filters.</Status>

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-xl border bg-card px-4 pt-10">
        <span className="absolute top-3 left-4 text-xs font-medium text-muted-foreground">{what}</span>
        {/* A phone has room for the winner only; the table below lists the rest. */}
        <div className="sm:hidden">
          <Podium entries={runs.slice(0, 1)} instanceName={instanceName} compact />
        </div>
        <div className="hidden sm:block">
          <Podium entries={runs.slice(0, 3)} instanceName={instanceName} />
        </div>
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
                    <span className="truncate" {...guildAttributes(r.guild_id, r.guild_name)}>{r.guild_name}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  <span {...speedrunClearAttributes(r, instanceName)}>{formatClock(r.duration_ms)}</span>
                </td>
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
