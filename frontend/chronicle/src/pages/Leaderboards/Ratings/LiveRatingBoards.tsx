import { useState, type CSSProperties, type ReactNode } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"
import { Crown, Flame, ShieldCheck, ChevronRight } from "lucide-react"
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay"
import {
  fetchLiveRatingPage, liveRatingURL, StaleRatingCursorError,
  type LiveRatingBoardRequest, type LiveRatingEntry, type LiveRatingMetric,
} from "./liveRatingAdapter"

export type LiveRatingBoardsProps = LiveRatingBoardRequest & {
  /** Optional display names; these do not participate in ranking or scoring. */
  realmNames?: Readonly<Record<string, string>>
  title?: string
}

const themes: Record<LiveRatingMetric, { label: string; color: string; icon: typeof Flame }> = {
  peak: { label: "Peak", color: "#e2b25a", icon: Flame },
  mastery: { label: "Mastery", color: "#72aac6", icon: ShieldCheck },
  ranked_mastery: { label: "Ranked Mastery", color: "#72aac6", icon: ShieldCheck },
  renown: { label: "Renown", color: "#b394e6", icon: Crown },
}

const displayValue = (value: number, metric: LiveRatingMetric) => metric === "renown" ? value.toLocaleString() : value.toFixed(1)
const playerEntry = (entry: LiveRatingEntry): entry is Extract<LiveRatingEntry, { player_guid: string }> => "player_guid" in entry
const bossEntry = (entry: LiveRatingEntry): entry is Extract<LiveRatingEntry, { eligible_kills: number }> => "eligible_kills" in entry

/** A published tenant board, not an aggregate across bosses or an all-class approximation. */
export function LiveRatingBoards(props: LiveRatingBoardsProps) {
  const { instanceName, encounterName, subject, metric, window, cohort, allClasses, realmIDs, realmNames, title } = props
  const url = liveRatingURL({ instanceName, encounterName, subject, metric, window, cohort, allClasses, realmIDs })
  const [refresh, setRefresh] = useState({ url: "", count: 0 })
  const revision = refresh.url === url ? refresh.count : 0
  const board = useInfiniteQuery({
    queryKey: ["tenant-rating-board", url, revision],
    queryFn: ({ pageParam }) => fetchLiveRatingPage(url!, pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (page) => page.next_cursor || undefined,
    enabled: url !== null,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const theme = themes[metric]
  const entries = board.data?.pages.flatMap((page) => page.entries) ?? []
  const stale = board.error instanceof StaleRatingCursorError
  const displayed = encounterName === undefined ? instanceName : `${instanceName} · ${encounterName}`
  const population = cohort?.maxPlayers ? `${cohort.maxPlayers} players` : "Size unrecorded"
  const playerScope = allClasses ? cohort?.playerClass ? `${cohort.playerClass} / All specs` : "All classes / specs"
    : `${cohort?.playerClass} / ${cohort?.spec}${cohort?.subSpec ? ` / ${cohort.subSpec}` : ""}`
  const subtitle = [subject === "player" ? "Characters" : "Guilds", metric === "renown" ? "All cohorts" : `${cohort?.difficulty || "Default"} · ${population}${subject === "player" ? ` · ${playerScope} · ${cohort?.performance?.toUpperCase()}` : ""}`, window === "period" ? "180 days" : window === "career" ? "Career" : "All time"].join(" · ")

  return (
    <section aria-label={`${displayed} ${theme.label} ${subject} ratings`} data-metric={metric} style={{ "--metric": theme.color } as CSSProperties} className="relative overflow-hidden rounded-xl border bg-card">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40" style={{ background: "radial-gradient(ellipse 50% 100% at 0% 0%, color-mix(in oklab, var(--metric) 14%, transparent), transparent 70%)" }} />
      <header className="relative flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
        <Emblem><theme.icon className="size-5 text-[color:var(--metric)]" /></Emblem>
        <div className="min-w-0 flex-1">
          <h2 className="font-wow truncate text-xl leading-tight">{title ?? displayed}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <span className="rounded-md border border-[color:var(--metric)]/30 bg-background/60 px-2.5 py-1.5 text-xs font-medium text-[color:var(--metric)]">{theme.label}</span>
      </header>
      {!url ? <StateMessage>Choose an exact raid or boss cohort to view published ratings.</StateMessage>
        : board.isPending ? <StateMessage status>Loading published ratings…</StateMessage>
        : stale ? <StateMessage alert>Ratings changed while loading. <button type="button" className="underline" onClick={() => setRefresh({ url, count: revision + 1 })}>Refresh from first page</button></StateMessage>
        : board.isError && !entries.length ? <StateMessage alert>Could not load published ratings. <button type="button" className="underline" onClick={() => void board.refetch()}>Retry</button></StateMessage>
        : !entries.length ? <StateMessage>No published scores for this cohort yet. This board may not have been seeded.</StateMessage>
        : <>
          <div className="styled-scrollbar relative overflow-x-auto border-t">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-b bg-black/10 text-[11px] tracking-wider text-muted-foreground uppercase">
                <tr><th className="px-4 py-2.5 text-left font-medium sm:px-5">{subject === "player" ? "Character" : "Guild"}</th><th className="px-3 py-2.5 text-right font-medium">{theme.label}</th>{encounterName !== undefined && metric !== "renown" && <th className="px-3 py-2.5 text-right font-medium">Eligible kills</th>}<th className="px-4 py-2.5 text-left font-medium">Realm</th></tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => <LiveRow key={`${entry.realm_id}-${playerEntry(entry) ? entry.player_guid : entry.guild_id}-${index}`} entry={entry} subject={subject} metric={metric} realm={entry.realm_name || realmNames?.[entry.realm_id] || entry.realm_id} showKills={encounterName !== undefined && metric !== "renown"} />)}
              </tbody>
            </table>
          </div>
          <footer className="relative flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
            <span>{entries.length} shown · published scores{realmIDs?.length ? " · realm display filter" : ""}</span>
            {board.isFetchNextPageError ? <span role="alert">Could not load more. <button type="button" className="underline" onClick={() => void board.fetchNextPage()}>Retry</button></span>
              : board.hasNextPage && <button type="button" disabled={board.isFetchingNextPage} onClick={() => void board.fetchNextPage()} className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 font-medium text-foreground hover:bg-white/5 disabled:opacity-50">{board.isFetchingNextPage ? "Loading…" : "Load more"} <ChevronRight className="size-3.5" /></button>}
          </footer>
        </>}
    </section>
  )
}

function LiveRow({ entry, subject, metric, realm, showKills }: { entry: LiveRatingEntry; subject: "player" | "guild"; metric: LiveRatingMetric; realm: string; showKills: boolean }) {
  const player = subject === "player" && playerEntry(entry)
  const cls = player ? entry.player_class : ""
  const name = player ? entry.player_name || entry.player_guid : "guild_id" in entry ? entry.guild_name || entry.guild_id : "Unknown guild"
  return <tr className="border-b border-white/5 last:border-b-0 hover:bg-white/[.025]">
    <td className="px-4 py-2.5 sm:px-5"><div className="flex items-center gap-2.5">
      {player && cls && <SpecIcon cls={cls} spec={entry.player_spec} className="size-6 shrink-0 rounded-sm" />}
      <span className="min-w-0"><span className="block truncate font-medium" style={player ? { color: CLASS_CSS_VAR[cls] } : undefined}>{name}</span>
        {player && <span className="block text-[11px] text-muted-foreground">{[entry.player_spec, entry.player_sub_spec].filter(Boolean).join(" · ")}{entry.guild_name ? ` · <${entry.guild_name}>` : ""}</span>}
      </span></div></td>
    <td className="px-3 py-2.5 text-right font-mono text-base text-[color:var(--metric)] tabular-nums">{displayValue(entry.score, metric)}</td>
    {showKills && <td className="px-3 py-2.5 text-right font-mono text-muted-foreground tabular-nums">{bossEntry(entry) ? entry.eligible_kills : "—"}</td>}
    <td className="px-4 py-2.5 text-xs text-muted-foreground">{realm}</td>
  </tr>
}

// Kept independent of the fixture-backed RatingParts module on live routes.
function Emblem({ children }: { children: ReactNode }) {
  return <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[color:var(--metric)] bg-[color:var(--metric)]/10">{children}</span>
}

function SpecIcon({ cls, spec, className }: { cls: string; spec: string; className: string }) {
  return <img className={className} src={spec ? `/c/icons/spec_${cls.toLowerCase()}_${spec.toLowerCase().replace(/\s+/g, "")}.png` : `/c/icons/class_${cls.toLowerCase()}.png`} alt={spec || cls} onError={(event) => {
    const image = event.currentTarget
    const fallback = `/c/icons/class_${cls.toLowerCase()}.png`
    if (image.getAttribute("src") === fallback) image.removeAttribute("src")
    else image.src = fallback
  }} />
}

function StateMessage({ children, alert, status }: { children: React.ReactNode; alert?: boolean; status?: boolean }) {
  return <p role={alert ? "alert" : status ? "status" : undefined} className="relative border-t px-5 py-10 text-center text-sm text-muted-foreground">{children}</p>
}
