import { useQuery } from "@tanstack/react-query"
import type { RatingLiveData } from "../Ratings/ratingLiveData"
import { useState, type CSSProperties, type ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { RATING_METRICS, type RatingMetric } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { cn } from "@/lib/utils"
import { MOBILE_EDGE_TO_EDGE } from "@/pages/Leaderboards/Hub/edgeToEdge"
import { BoardSearch, MasteryPartCells, MasteryPartHeaders, PublishedMasteryCells, PublishedMasteryHeaders, PeakComponents } from "@/pages/Leaderboards/Ratings/RatingFullList"
import { BOSS_PEAK_LABELS } from "@/pages/Leaderboards/Ratings/ratingLiveData"
import { BoardSkeleton, BossMetricSkeleton } from "@/pages/Leaderboards/Ratings/RatingLeaderboard"
import { BossPortrait, Emblem, RankMark } from "@/pages/Leaderboards/Ratings/RatingParts"
import { METRIC_THEMES, type MetricTheme, type RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { formatClock, guildRatings, type GuildRating } from "./hub.fixtures"
import { guildAttributes } from "@/components/EntityMenu/leaderboardEntities"

/** Published guild ratings for the guild boards: whole ranked lists, and each boss's leaders. */
export interface GuildRatingData {
  live?: RatingLiveData
  ratings: Record<RatingMetric, GuildRating[]>
  perBossState?: (boss: string) => Partial<Record<RatingMetric, { pending?: boolean; error?: string }>>
  perBoss: (boss: string) => Record<RatingMetric, GuildRating[]> | undefined
  pending?: boolean
  error?: string
}

const PAGE_SIZE = 50

const EMPTY_GUILD_RATINGS: Record<RatingMetric, GuildRating[]> = { peak: [], mastery: [], renown: [] }

export interface MetricRow {
  id: string
  name: ReactNode
  score: number
  /** What stands behind the score, shown muted beside it (Peak's DPS). */
  raw?: string
}

/** Leaders per column on the overview's rating cards. */
export const METRIC_COLUMN_ROWS = 5

/**
 * Peak, Ranked Mastery, and Renown side by side, each column its own board
 * whose header (and footer link) opens the full one. Shared by the player and
 * guild rating cards so both read the same. Without columns, each column shows
 * its fixed number of skeleton rows while loading.
 */
export function MetricColumns({ columns, onOpen }: { columns?: Record<RatingMetric, MetricRow[]>; onOpen: (metric: RatingMetric) => void }) {
  return (
    <div role={columns ? undefined : "status"} aria-label={columns ? undefined : "Loading"} className="grid flex-1 max-sm:divide-y sm:grid-cols-3 sm:divide-x">
      {RATING_METRICS.map((m) => {
        const t = METRIC_THEMES[m]
        return (
          <div key={m} className="flex min-w-0 flex-col">
            <button
              type="button"
              onClick={() => onOpen(m)}
              title={`Open the ${t.label} leaderboard`}
              className="group/metric flex w-full cursor-pointer items-center gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-white/[.04]"
              style={{ boxShadow: `inset 0 2px 0 ${t.accent}` }}
            >
              <t.icon className="size-4" style={{ color: t.accent }} />
              <span className="text-xs font-semibold tracking-wide uppercase">{t.label}</span>
              <ChevronRight className="ml-auto size-3.5 text-muted-foreground transition-colors group-hover/metric:text-foreground" />
            </button>
            <ol>
              {!columns && Array.from({ length: METRIC_COLUMN_ROWS }, (_, i) => (
                <li key={i} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5 last:border-b-0">
                  <span className="size-5 shrink-0 animate-pulse rounded-sm bg-white/[.06]" />
                  <span className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${60 - i * 7}%` }} />
                  <span className="ml-auto h-3 w-8 animate-pulse rounded bg-white/[.06]" />
                </li>
              ))}
              {columns?.[m].map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5 last:border-b-0">
                  <span className="w-3 font-mono text-xs text-muted-foreground">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">{r.name}</span>
                  {r.raw && <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{r.raw}</span>}
                  <span className="font-mono text-sm tabular-nums" style={i === 0 ? { color: t.accent } : undefined}>
                    {t.format(r.score)}
                  </span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => onOpen(m)}
              className="mt-auto flex cursor-pointer items-center gap-1 border-t border-white/5 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-white/[.04] hover:underline"
              style={{ color: t.accent }}
            >
              {/* "Ranked Mastery" wraps the link onto two lines in a narrow column. */}
              Full {m === "mastery" ? "Mastery" : t.label} board
              <ArrowRight className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Guild logo (when it has one) and name; a blank slot keeps names aligned. */
export function GuildName({ guild, guildId, logo, size = "size-5" }: { guild: string; guildId?: string; logo?: string; size?: string }) {
  return (
    <>
      {logo ? (
        <img src={logo} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
      ) : (
        // No logo: a muted initial keeps names aligned with logo rows without leaving a blank gap.
        <span
          className={`${size} flex shrink-0 items-center justify-center rounded-full bg-white/[.06] text-[10px] font-semibold text-muted-foreground uppercase ring-1 ring-white/10`}
          aria-hidden
        >
          {guild.trim().charAt(0)}
        </span>
      )}
      <span className="truncate" {...guildAttributes(guildId, guild)}>{guild}</span>
    </>
  )
}

function toRows(list: GuildRating[]): MetricRow[] {
  return list.map((g) => ({ id: g.guildId ? `${g.detail}:${g.guildId}` : g.guild, name: <GuildName guild={g.guild} guildId={g.guildId} logo={g.logo} />, score: g.score }))
}

/** The overview's ratings card in Guilds mode: top five guilds per metric. */
export function GuildRatingLeaders({ ratings, onOpen }: { ratings: Record<RatingMetric, GuildRating[]>; onOpen: (metric: RatingMetric) => void }) {
  return <MetricColumns columns={{ peak: toRows(ratings.peak), mastery: toRows(ratings.mastery), renown: toRows(ratings.renown) }} onOpen={onOpen} />
}

/**
 * Ratings tab in Guilds mode, built like the character boards: on a full clear (or a set), the board on
 * top and a compact card per boss below; "All N ranked" swaps the board for the full table. One boss
 * opens its table straight away.
 */
export function GuildRatingBoards({
  instanceName,
  view,
  onView,
  bosses,
  allBosses,
  where,
  titleBadge,
  onBoss,
  toolbar,
  data,
}: {
  instanceName: string
  view: RatingView
  /** Published ratings; without it the boards show generated mock guilds. */
  data?: GuildRatingData
  onView: (view: RatingView) => void
  /** Metric switch and period, shown in the board's (or table's) header. */
  toolbar?: ReactNode
  /** The selection: undefined for a full clear, one boss, or a set. */
  bosses?: readonly string[]
  allBosses: readonly string[]
  where: string
  /** Shown after the title, e.g. the encounter variant mark. */
  titleBadge?: ReactNode
  onBoss: (boss: string) => void
}) {
  const oneBoss = bosses?.length === 1 ? bosses[0] : undefined
  const theme = METRIC_THEMES[view]
  const title = oneBoss ?? (bosses ? `${bosses.length} bosses` : instanceName)
  const kindLabel = oneBoss ? "Boss" : bosses ? "Bosses" : "Raid"
  // Expansion and search belong to the selection, and stay open across metrics, as on the character boards.
  const key = (bosses ?? []).join("|")
  const [expandedKey, setExpandedKey] = useState<string>()
  const [search, setSearch] = useState({ key: "", text: "" })
  const query = search.key === key ? search.text : ""
  const setQuery = (text: string) => setSearch({ key, text })
  // One boss, or a single metric (Peak, Mastery, Renown): the full table straight away, no boss cards.
  const tableOnly = !!oneBoss || view !== "overview"
  const expanded = tableOnly || expandedKey === key || query.trim() !== ""
  const all = data ? data.ratings : guildRatings(bosses, allBosses, instanceName, 99)
  const label = `Guild ${view === "overview" ? "ratings" : theme.label} · ${where}`

  if (data?.error) {
    return (
      <section role="alert" className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
        {data.error}
      </section>
    )
  }

  return (
    <div className="space-y-5" style={{ "--metric": theme.accent } as CSSProperties}>
      {data?.pending ? <BoardSkeleton /> : expanded ? (
        <GuildFullTable
          toolbar={toolbar}
          label={label}
          title={title}
          titleBadge={titleBadge}
          oneBoss={oneBoss}
          kindLabel={kindLabel}
          view={view}
          ratings={all}
          live={data?.live}
          query={query}
          onQuery={setQuery}
          onCollapse={
            tableOnly
              ? undefined
              : () => {
                  setExpandedKey(undefined)
                  setQuery("")
                }
          }
        />
      ) : (
        <section aria-label={label} className="relative flex flex-col overflow-hidden rounded-xl border bg-card">
          <BoardHeader oneBoss={oneBoss} title={title} theme={theme} subtitle={data?.live ? undefined : `${all.peak.length} guilds ranked`} toolbar={toolbar}>
            <BoardSearch query={query} onQuery={setQuery} />
          </BoardHeader>
          <MetricColumns
            columns={{ peak: toRows(all.peak.slice(0, 5)), mastery: toRows(all.mastery.slice(0, 5)), renown: toRows(all.renown.slice(0, 5)) }}
            onOpen={onView}
          />
          <button
            type="button"
            onClick={() => setExpandedKey(key)}
            className="relative mt-auto flex cursor-pointer items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[.03] hover:text-foreground"
          >
            <ArrowDown className="size-3.5" />
            {data?.live ? "Full board" : `All ${all.peak.length} ranked`}
          </button>
        </section>
      )}

      {/* Boards without bosses (the career board) have no side boards to show. */}
      {!tableOnly && (bosses ?? allBosses).length > 0 && (
        <section aria-label="Boss boards" className="space-y-3">
          <h2 className="px-1 text-sm font-semibold">By boss</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {(bosses ?? allBosses).map((boss) => (
              <BossBoard
                key={boss}
                boss={boss}
                states={data?.perBossState?.(boss)}
                ratings={data ? (data.perBoss(boss) ?? EMPTY_GUILD_RATINGS) : guildRatings([boss], allBosses, instanceName, 3)}
                view={view}
                onOpen={() => onBoss(boss)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

/** Emblem, "Raid · Guild Peak", title; controls on the right. The character boards' header. */
function BoardHeader({
  oneBoss,
  title,
  titleBadge,
  theme,
  subtitle,
  lead,
  toolbar,
  children,
}: {
  oneBoss?: string
  title: string
  titleBadge?: ReactNode
  theme: MetricTheme
  subtitle?: string
  lead?: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{ background: "radial-gradient(ellipse 50% 100% at 0% 0%, color-mix(in oklab, var(--metric) 14%, transparent), transparent 70%)" }}
      />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        {lead}
        <div className="flex min-w-0 items-center gap-3">
          <Emblem size="sm" accent>
            {oneBoss ? <BossPortrait boss={oneBoss} size="sm" /> : <theme.icon className="size-5 text-[color:var(--metric)]" />}
          </Emblem>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2"><h2 className="truncate font-wow text-xl leading-tight">{title}</h2>{titleBadge}</div>
            {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
          </div>
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-3">{children}</div>
      </div>
    </>
  )
}

/**
 * The full guild ranking, laid out like the character table: rank, guild, the ranking's own number
 * next to the name, then supporting columns (Peak: run time and date; then what the score stands on).
 * Overview shows all three scores and sorts by any of them.
 */
function GuildFullTable({
  label,
  title,
  titleBadge,
  oneBoss,
  kindLabel,
  view,
  ratings,
  query,
  onQuery,
  onCollapse,
  toolbar,
  live,
}: {
  live?: RatingLiveData
  toolbar?: ReactNode
  label: string
  title: string
  titleBadge?: ReactNode
  oneBoss?: string
  kindLabel: string
  view: RatingView
  ratings: Record<RatingMetric, GuildRating[]>
  query: string
  onQuery: (query: string) => void
  onCollapse?: () => void
}) {
  const [sortBy, setSortBy] = useState<RatingMetric>(view === "overview" ? "peak" : view)
  const metric = view === "overview" ? sortBy : view
  const theme = METRIC_THEMES[view]
  const pageKey = `${metric}|${query}|${live?.pageKey}`
  const [pageState,setPageState] = useState({key:"",page:0})
  const page = pageState.key === pageKey ? pageState.page : 0
  const published = useQuery({queryKey:["hub-guild-v2-page",pageKey,page],queryFn:()=>live!.loadPage!({scope:oneBoss ? {boss:oneBoss} : {},metric,period:"all",query,page}),enabled:!!live?.loadPage,retry:false})
  const byGuild = (m: RatingMetric) => new Map(ratings[m].map((g) => [g.guild, g]))
  const scores = { peak: byGuild("peak"), mastery: byGuild("mastery"), renown: byGuild("renown") }
  const ranked = live ? (published.data?.rows ?? []).map((row, i) => ({rank:row.rank > 0 ? row.rank : page * PAGE_SIZE + i + 1,g:{guild:row.entry.name,guildId:row.entry.guid,logo:row.entry.logo,score:row.entry.score,detail:row.entry.detail,realmLabel:row.entry.realmLabel,ms:row.peakRun?.ms ?? row.entry.durationMs,date:row.peakRun?.date,log:row.peakRun?.log} as GuildRating})) : ratings[metric].map((g, i) => ({ rank: i + 1, g }))
  const needle = query.trim().toLowerCase()
  const rows = !live && needle ? ranked.filter((r) => r.g.guild.toLowerCase().includes(needle)) : ranked
  const top = ranked[0]?.g.score ?? 1
  const timeLabel = oneBoss ? "Kill time" : kindLabel === "Bosses" ? "Total kill time" : "Clear time"
  /** Live multi-boss Peak shows each boss's bar; one boss (or the fixtures) shows a run time instead. */
  const bossBars = live && !oneBoss
  const peakLabels = live?.peakLabels ?? BOSS_PEAK_LABELS
  const peakBars = (g: GuildRating) => {
    const row = published.data?.rows.find((row) => row.entry.guid === g.guildId && row.entry.detail === g.detail)
    return row ? <PeakComponents entry={row.entry} scores={row.peakComponents} labels={peakLabels} /> : null
  }

  return (
    <section aria-label={`${label} full list`} className={cn("relative overflow-hidden rounded-xl border bg-card", MOBILE_EDGE_TO_EDGE)}>
      <BoardHeader
        oneBoss={oneBoss}
        title={title}
        titleBadge={titleBadge}
        theme={theme}
        subtitle={live ? undefined : `${ranked.length} guilds ranked`}
        toolbar={toolbar}
        lead={
          onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="relative -ml-1 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              <ChevronLeft className="size-4" />
              Back to boards
            </button>
          )
        }
      >
        <BoardSearch query={query} onQuery={onQuery} autoFocus={query !== ""} />
      </BoardHeader>

      <div className="styled-scrollbar overflow-x-auto border-t">
        {/* Peak folds its extra columns on a phone, matching the character board; other views still scroll. */}
        <table className={cn("w-full table-auto text-sm", view === "peak" ? "sm:min-w-[42rem]" : "min-w-[42rem]")}>
          <thead className="border-b bg-black/10 text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="w-14 px-4 py-2.5 text-left font-medium sm:px-5">#</th>
              <th className="w-[26%] px-2 py-2.5 pr-6 text-left font-medium whitespace-nowrap">Guild</th>
              {view === "overview" ? (
                RATING_METRICS.map((m) => {
                  const t = METRIC_THEMES[m]
                  return (
                    <th key={m} className="px-3 py-2.5 text-left font-medium">
                      <button
                        type="button"
                        onClick={() => setSortBy(m)}
                        aria-pressed={sortBy === m}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-foreground",
                          sortBy === m && "text-foreground",
                        )}
                      >
                        <t.icon className="size-3.5" style={{ color: t.accent }} />
                        <span className="hidden sm:inline">{t.label}</span>
                        {sortBy === m && <ArrowDown className="size-3" />}
                      </button>
                    </th>
                  )
                })
              ) : (
                <>
                  {/* Phones: the boss bars sit between the name and the right-aligned score. */}
                  {view === "peak" && bossBars && <th className="px-2 py-2.5 text-left font-medium capitalize sm:hidden">{peakLabels.noun}</th>}
                  <th className={cn("w-32 px-3 py-2.5 text-left font-medium", view === "peak" && "pr-4 text-right sm:pr-3 sm:text-left")}>{theme.label}</th>
                  {view === "mastery" && (live ? <PublishedMasteryHeaders /> : <MasteryPartHeaders />)}
                  {view === "peak" && (
                    <>
                      <th className={cn("hidden px-3 py-2.5 font-medium sm:table-cell", bossBars ? "text-left" : "text-right")}>{bossBars ? peakLabels.header : timeLabel}</th>
                      <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Date</th>
                    </>
                  )}
                </>
              )}
              <th className="hidden w-48 whitespace-nowrap px-3 py-2.5 pr-4 text-left font-medium sm:pr-5 lg:table-cell">Realm</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rank, g }) => (
              <tr key={g.guildId ? `${g.detail}:${g.guildId}` : g.guild} className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[.025]">
                <td className="px-4 py-2 sm:px-5">
                  <RankMark rank={rank} size="sm" />
                </td>
                <td className="px-2 py-2 pr-2 whitespace-nowrap sm:pr-8">
                  {/* Capped on phones so a long guild name truncates instead of widening the table; tighter
                      when the boss bars share the row. */}
                  <span className={cn("flex items-center gap-2.5 font-medium sm:max-w-none", view === "peak" && bossBars ? "max-w-[8.5rem]" : "max-w-[12rem]")}>
                    <GuildName guild={g.guild} guildId={g.guildId} logo={g.logo} size="size-6" />
                  </span>
                </td>
                {view === "overview" ? (
                  RATING_METRICS.map((m) => {
                    const source = live ? published.data?.rows.find(row => row.entry.guid === g.guildId && row.entry.detail === g.detail)?.scores?.[m] : undefined
                    const score = live ? source : scores[m].get(g.guild)
                    return (
                      <td
                        key={m}
                        className={cn("px-3 py-2 font-mono tabular-nums", sortBy !== m && "text-muted-foreground")}
                        style={sortBy === m && rank === 1 ? { color: METRIC_THEMES[m].accent } : undefined}
                      >
                        {score ? METRIC_THEMES[m].format(score.score) : "—"}
                      </td>
                    )
                  })
                ) : (
                  <>
                    {view === "peak" && bossBars && <td className="px-2 py-2 sm:hidden">{peakBars(g)}</td>}
                    <td className={cn("px-3 py-2", view === "peak" && "pr-4 sm:pr-3")}>
                      <div className={cn("flex flex-col items-start gap-1", view === "peak" && "items-end sm:items-start")}>
                        <span className="font-mono text-base tabular-nums" style={rank === 1 ? { color: theme.accent } : undefined}>
                          {theme.format(g.score)}
                        </span>
                        <span className="h-0.5 w-20 overflow-hidden rounded-full bg-white/5">
                          <span
                            className="block h-full rounded-full bg-[color:var(--metric)] opacity-60"
                            style={{ width: `${(g.score / top) * 100}%` }}
                          />
                        </span>
                        {/* Phones fold the run time under the score, as the character board does. */}
                        {view === "peak" && !bossBars && g.ms !== undefined && (
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums sm:hidden">
                            {g.log ? (
                              <Link to={`/instances/${g.log}`} className="underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground">
                                {formatClock(g.ms)}
                              </Link>
                            ) : formatClock(g.ms)}
                          </span>
                        )}
                      </div>
                    </td>
                    {view === "mastery" && (live ? <PublishedMasteryCells entry={published.data!.rows.find(row => row.entry.guid === g.guildId && row.entry.detail === g.detail)!.entry} /> : <MasteryPartCells parts={g.mastery} />)}
                    {view === "peak" && (
                      <>
                        <td className={cn("hidden px-3 py-2 font-mono text-muted-foreground tabular-nums sm:table-cell", !bossBars && "text-right")}>
                          {bossBars ? peakBars(g) : g.ms !== undefined ? (
                            g.log ? (
                              <Link to={`/instances/${g.log}`} className="underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground">
                                {formatClock(g.ms)}
                              </Link>
                            ) : formatClock(g.ms)
                          ) : "Unavailable"}
                        </td>
                        <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{g.date}</td>
                      </>
                    )}
                  </>
                )}
                <td className="hidden whitespace-nowrap px-3 py-2 pr-4 text-xs text-muted-foreground sm:pr-5 lg:table-cell">{g.realmLabel || "Unknown realm"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  {live && published.isPending ? "Loading guild scores…" : published.isError ? published.error.message : "No guilds match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        {live ? <div className="flex items-center justify-between"><button disabled={!published.data?.hasPreviousPage || published.isFetching} onClick={()=>setPageState({key:pageKey,page:page-1})} className="disabled:opacity-40">Previous</button><span>{rows.length} results · page {page+1}</span><button disabled={!published.data?.hasNextPage || published.isFetching} onClick={()=>setPageState({key:pageKey,page:page+1})} className="disabled:opacity-40">Next</button></div> : <>{rows.length === 0 ? "0" : `1–${rows.length}`} of {rows.length}</>}
      </div>
    </section>
  )
}

/** One boss: #1 per metric on the overview, top three on a single metric. */
function BossBoard({
  states,
  boss,
  ratings: r,
  view,
  onOpen,
}: {
  boss: string
  states?: Partial<Record<RatingMetric, { pending?: boolean; error?: string }>>
  ratings: Record<RatingMetric, GuildRating[]>
  view: RatingView
  onOpen: () => void
}) {
  const rows = (view === "overview" ? RATING_METRICS.map((m) => ({ metric: m, g: r[m][0] })) : r[view].map((g) => ({ metric: view, g }))).filter(
    (row): row is { metric: RatingMetric; g: GuildRating } => !!row.g,
  )
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-busy={Object.values(states ?? {}).some(state => state.pending)}
      aria-label={boss}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-white/20"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <BossPortrait boss={boss} size="sm" />
        <span className="truncate font-wow text-base group-hover:text-primary">{boss}</span>
      </div>
      <ol className="text-xs">
        {(view === "overview" ? RATING_METRICS.map(metric => ({metric,g:r[metric][0]})) : rows).map(({ metric, g }, i) => {
          const t = METRIC_THEMES[metric]
          if (states?.[metric]?.pending) return <BossMetricSkeleton key={metric} boss={boss} label={t.label} />
          if (states?.[metric]?.error) return <li key={metric} role="alert" title={states[metric]?.error} className="h-7 truncate px-3 py-1.5 text-muted-foreground">{states[metric]?.error}</li>
          if (!g) return <li key={metric} className="h-7 px-3 py-1.5 text-muted-foreground">No ranked kills</li>
          return (
            <li key={metric + g.guild} className="flex items-center gap-2 px-3 py-1.5">
              {view === "overview" ? (
                <t.icon className="size-3.5 shrink-0" style={{ color: t.accent }} />
              ) : (
                <span className="w-3.5 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <GuildName guild={g.guild} guildId={g.guildId} logo={g.logo} size="size-4" />
              </span>
              <span className="font-mono tabular-nums">{t.format(g.score)}</span>
            </li>
          )
        })}
      </ol>
    </button>
  )
}
