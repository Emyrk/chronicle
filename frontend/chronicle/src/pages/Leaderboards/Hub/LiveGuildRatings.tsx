import { useState, type CSSProperties, type ReactNode } from "react"
import { useQueries, useQuery } from "@tanstack/react-query"
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { BoardSearch } from "@/pages/Leaderboards/Ratings/RatingFullList"
import { BossPortrait, RankMark } from "@/pages/Leaderboards/Ratings/RatingParts"
import { METRIC_THEMES, type RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { RATING_METRICS, type RatingMetric, type RatingPeriod } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { fetchLiveRatingPage, liveRatingURL, type LiveRatingCohort, type LiveRatingEntry } from "@/pages/Leaderboards/Ratings/liveRatingAdapter"
import { fetchLiveGuildFullList, liveGuildFullListURL } from "@/pages/Leaderboards/Ratings/liveRatingFullList"
import { GuildName, MetricColumns } from "./GuildRatings"

const apiMetric = (metric: RatingMetric) => metric === "mastery" ? "mastery" as const : metric
const windowFor = (metric: RatingMetric, period: RatingPeriod) => metric === "renown"
  ? period === "all" ? "career" as const : "period" as const
  : period === "all" ? "all_time" as const : "period" as const
const guildName = (entry: LiveRatingEntry) => "guild_id" in entry ? entry.guild_name || entry.guild_id : "Unknown guild"

type Props = {
  instanceName: string
  bosses: readonly string[]
  encounterName?: string
  onBoss: (boss: string) => void
  view: RatingView
  onView: (view: RatingView) => void
  period: RatingPeriod
  cohort?: LiveRatingCohort
  realmIDs?: readonly string[]
  toolbar?: ReactNode
}

/** The Storybook guild board and full list, fed only by published guild scores. */
export function LiveGuildRatings({ instanceName, bosses, encounterName, onBoss, view, onView, period, cohort, realmIDs, toolbar }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(0)
  const [sortBy, setSortBy] = useState<RatingMetric>("peak")
  const metric = view === "overview" ? sortBy : view
  const targets = [encounterName, ...(encounterName ? [] : bosses)]
  const requests = targets.flatMap((boss) => RATING_METRICS.map((m) => liveRatingURL({
    instanceName, encounterName: boss, subject: "guild", metric: apiMetric(m), window: windowFor(m, period),
    cohort: m === "renown" ? undefined : cohort, realmIDs,
  })))
  const previews = useQueries({ queries: requests.map((url) => ({
    queryKey: ["hub-guild-rating", url], queryFn: () => fetchLiveRatingPage(url!), enabled: !!url,
    staleTime: 5 * 60 * 1000, retry: false,
  })) })
  const listURL = liveGuildFullListURL({ instanceName, encounterName, subject: "guild",
    metric: apiMetric(metric), window: windowFor(metric, period), cohort: metric === "renown" ? undefined : cohort,
    realmIDs, query, page })
  const list = useQuery({ queryKey: ["hub-guild-full-list", listURL], queryFn: () => fetchLiveGuildFullList(listURL!),
    enabled: !!listURL && (!!encounterName || expanded || query.trim() !== ""), staleTime: 5 * 60 * 1000, retry: false })
  const theme = METRIC_THEMES[view]
  const title = encounterName ?? instanceName
  const showList = !!encounterName || expanded || query.trim() !== ""
  const rowsFor = (targetIndex: number, m: RatingMetric) => previews[targetIndex * 3 + RATING_METRICS.indexOf(m)]?.data?.entries ?? []
  const board = (m: RatingMetric) => rowsFor(0, m)
  const search = <BoardSearch query={query} onQuery={(text) => { setQuery(text); setPage(0) }} autoFocus={showList && !!query} />
  return <div className="space-y-5" style={{ "--metric": theme.accent } as CSSProperties}>
    <section aria-label={`Guild ${theme.label} · ${title}`} className="relative overflow-hidden rounded-xl border bg-card">
      <header className="relative flex flex-wrap items-center gap-3 px-4 py-3">
        {showList && !encounterName && <button type="button" onClick={() => { setExpanded(false); setQuery(""); setPage(0) }} className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground"><ChevronLeft className="size-4" />Back to boards</button>}
        <span className="font-wow text-xl">{title}</span>{toolbar}<div className="ml-auto">{search}</div>
      </header>
      {showList ? !listURL ? <p className="border-t px-5 py-10 text-sm text-muted-foreground">Choose an exact guild cohort.</p>
        : list.isPending ? <p role="status" className="border-t px-5 py-10">Loading published ratings…</p>
        : list.isError ? <p role="alert" className="border-t px-5 py-10">Published ratings unavailable.</p>
        : <>
          <div className="styled-scrollbar overflow-x-auto border-t"><table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b bg-black/10 text-xs text-muted-foreground uppercase"><tr>
              <th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">Guild</th>
              {view === "overview" ? RATING_METRICS.map((m) => <th key={m} className="px-3 py-2 text-left"><button type="button" className="cursor-pointer" onClick={() => { setSortBy(m); setPage(0) }}>{METRIC_THEMES[m].label}{sortBy === m ? " ↓" : ""}</button></th>)
                : <><th className="px-3 py-2 text-left">{theme.label}</th>
                  {view === "mastery" && ["Peak", "Form", "Floor", "Eligible kills"].map((label) => <th key={label} className="px-3 py-2 text-right">{label}</th>)}
                  {view === "peak" && <><th className="px-3 py-2 text-right">{encounterName ? "Kill time" : "Clear time"}</th><th className="px-3 py-2 text-left">Date</th></>}
                  <th className="px-3 py-2 text-left">Record</th></>}
              <th className="px-3 py-2 text-left">Realm</th>
            </tr></thead><tbody>
              {list.data.rows.map(({ rank, entry, scores }) => <tr key={`${entry.realm_id}:${"guild_id" in entry ? entry.guild_id : rank}`} className="border-b border-white/5">
                <td className="px-4 py-2"><RankMark rank={rank} size="sm" /></td>
                <td className="px-4 py-2 font-medium"><GuildName guild={guildName(entry)} /></td>
                {view === "overview" ? RATING_METRICS.map((m) => <td key={m} className="px-3 py-2 font-mono">{scores[m] == null ? "—" : METRIC_THEMES[m].format(scores[m])}</td>)
                  : <><td className="px-3 py-2 font-mono" style={rank === 1 ? { color: theme.accent } : undefined}>{theme.format(entry.score)}</td>
                    {view === "mastery" && <><td className="px-3 py-2 text-right font-mono">{"best_locked_parse" in entry && entry.best_locked_parse != null ? entry.best_locked_parse.toFixed(1) : "—"}</td><td className="px-3 py-2 text-right font-mono">{"form" in entry && entry.form != null ? entry.form.toFixed(1) : "—"}</td><td className="px-3 py-2 text-right font-mono">{"floor_score" in entry && entry.floor_score != null ? entry.floor_score.toFixed(1) : "—"}</td><td className="px-3 py-2 text-right font-mono">{"eligible_kills" in entry ? entry.eligible_kills : "—"}</td></>}
                    {view === "peak" && <><td className="px-3 py-2 text-right">—</td><td className="px-3 py-2">—</td></>}
                    <td className="px-3 py-2 text-muted-foreground">—</td></>}
                <td className="px-3 py-2 text-xs text-muted-foreground">{entry.realm_name || entry.realm_id}</td>
              </tr>)}
              {!list.data.rows.length && <tr><td colSpan={7} className="px-5 py-10 text-muted-foreground">No guilds match.</td></tr>}
            </tbody></table></div>
          <footer className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
            <span>{list.data.total} guilds match · global ranks</span>
            <span className="flex items-center gap-2"><button type="button" aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></button>{page + 1} / {Math.max(1, Math.ceil(list.data.total / 50))}<button type="button" aria-label="Next page" disabled={!list.data.has_next_page} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></button></span>
          </footer>
        </>
      : <>
        {view === "overview" ? <MetricColumns columns={Object.fromEntries(RATING_METRICS.map((m) => [m, board(m).slice(0, 5).map((entry) => ({ id: `${entry.realm_id}:${"guild_id" in entry ? entry.guild_id : ""}`, name: <GuildName guild={guildName(entry)} />, score: entry.score }))])) as Record<RatingMetric, { id: string; name: ReactNode; score: number }[]>} onOpen={onView} ranksKnown={!realmIDs?.length} />
          : <div className="grid border-t lg:grid-cols-2">{[0, 5].map((start) => <ol key={start}>{board(view).slice(start, start + 5).map((entry, i) => <li key={`${entry.realm_id}:${"guild_id" in entry ? entry.guild_id : i}`} className="flex items-center gap-3 border-b border-white/5 px-4 py-2">{!realmIDs?.length && <RankMark rank={start + i + 1} size="sm" />}<span className="flex-1"><GuildName guild={guildName(entry)} /></span><span className="font-mono">{theme.format(entry.score)}</span></li>)}</ol>)}</div>}
        <button type="button" onClick={() => setExpanded(true)} className="flex w-full cursor-pointer items-center justify-center gap-1 border-t px-4 py-2 text-xs text-muted-foreground"><ArrowDown className="size-4" />All ranked</button>
      </>}
    </section>
    {!encounterName && !showList && <section aria-label="Boss boards" className="space-y-3"><h2 className="px-1 text-sm font-semibold">By boss</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{bosses.map((boss, i) => <button key={boss} type="button" onClick={() => onBoss(boss)} className="cursor-pointer rounded-xl border bg-card p-3 text-left"><span className="flex items-center gap-2 font-wow"><BossPortrait boss={boss} size="sm" />{boss}</span>{(view === "overview" ? RATING_METRICS : [view]).map((m) => { const entry = rowsFor(i + 1, m)[0]; return <div key={m} className="mt-2 flex items-center gap-2 text-xs"><METRIC_ICON metric={m} /><span className="min-w-0 flex-1 truncate">{entry ? guildName(entry) : "No ranked kills"}</span><span className="font-mono">{entry ? METRIC_THEMES[m].format(entry.score) : "—"}</span></div> })}<ArrowRight className="mt-2 size-3 text-muted-foreground" /></button>)}</div></section>}
  </div>
}

function METRIC_ICON({ metric }: { metric: RatingMetric }) {
  const Icon = METRIC_THEMES[metric].icon
  return <Icon className="size-3.5" style={{ color: METRIC_THEMES[metric].accent }} />
}
