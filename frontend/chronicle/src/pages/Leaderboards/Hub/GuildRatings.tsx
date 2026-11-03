import { useState, type CSSProperties, type ReactNode } from "react"
import { ArrowDown, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { RATING_METRICS, type RatingMetric } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { cn } from "@/lib/utils"
import { BoardSearch, MasteryPartCells, MasteryPartHeaders } from "@/pages/Leaderboards/Ratings/RatingFullList"
import { BossPortrait, Emblem, RankMark } from "@/pages/Leaderboards/Ratings/RatingParts"
import { METRIC_THEMES, type MetricTheme, type RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { formatClock, guildRatings, type GuildRating } from "./hub.fixtures"

export interface MetricRow {
  id: string
  name: ReactNode
  score: number
}

/**
 * Peak, Ranked Mastery, and Renown side by side, each column its own board
 * whose header (and footer link) opens the full one. Shared by the player and
 * guild rating cards so both read the same.
 */
export function MetricColumns({ columns, onOpen, ranksKnown = true }: { columns: Record<RatingMetric, MetricRow[]>; onOpen: (metric: RatingMetric) => void; ranksKnown?: boolean }) {
  return (
    <div className="grid flex-1 max-sm:divide-y sm:grid-cols-3 sm:divide-x">
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
              {columns[m].map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5 last:border-b-0">
                  <span className="w-3 font-mono text-xs text-muted-foreground">{ranksKnown ? i + 1 : ""}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">{r.name}</span>
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
              Full {t.label} board
              <ArrowRight className="size-3" />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Guild logo (when it has one) and name; a blank slot keeps names aligned. */
export function GuildName({ guild, logo, size = "size-5" }: { guild: string; logo?: string; size?: string }) {
  return (
    <>
      {logo ? (
        <img src={logo} alt="" className={`${size} shrink-0 rounded-full object-cover`} />
      ) : (
        <span className={`${size} shrink-0`} aria-hidden />
      )}
      <span className="truncate">{guild}</span>
    </>
  )
}

function toRows(list: GuildRating[]): MetricRow[] {
  return list.map((g) => ({ id: g.guild, name: <GuildName guild={g.guild} logo={g.logo} />, score: g.score }))
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
  onBoss,
  toolbar,
}: {
  instanceName: string
  view: RatingView
  onView: (view: RatingView) => void
  /** Metric switch and period, shown in the board's (or table's) header. */
  toolbar?: ReactNode
  /** The selection: undefined for a full clear, one boss, or a set. */
  bosses?: readonly string[]
  allBosses: readonly string[]
  where: string
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
  const expanded = !!oneBoss || expandedKey === key || query.trim() !== ""
  const all = guildRatings(bosses, allBosses, instanceName, 99)
  const label = `Guild ${view === "overview" ? "ratings" : theme.label} · ${where}`

  return (
    <div className="space-y-5" style={{ "--metric": theme.accent } as CSSProperties}>
      {expanded ? (
        <GuildFullTable
          toolbar={toolbar}
          label={label}
          title={title}
          oneBoss={oneBoss}
          kindLabel={kindLabel}
          view={view}
          ratings={all}
          query={query}
          onQuery={setQuery}
          onCollapse={
            oneBoss
              ? undefined
              : () => {
                  setExpandedKey(undefined)
                  setQuery("")
                }
          }
        />
      ) : (
        <section aria-label={label} className="relative flex flex-col overflow-hidden rounded-xl border bg-card">
          <BoardHeader oneBoss={oneBoss} title={title} theme={theme} subtitle={`${all.peak.length} guilds ranked`} toolbar={toolbar}>
            <BoardSearch query={query} onQuery={setQuery} />
          </BoardHeader>
          {view === "overview" ? (
            <MetricColumns
              columns={{ peak: toRows(all.peak.slice(0, 5)), mastery: toRows(all.mastery.slice(0, 5)), renown: toRows(all.renown.slice(0, 5)) }}
              onOpen={onView}
            />
          ) : (
            // Top ten in two columns, 1–5 and 6–10, like the character board.
            <div className="relative grid border-t max-lg:divide-y lg:grid-cols-2 lg:divide-x">
              {[0, 5].map((start) => (
                <ol key={start}>
                  {all[view].slice(start, start + 5).map((g, i) => (
                    <GuildEntryRow key={g.guild} rating={g} rank={start + i + 1} theme={theme} />
                  ))}
                </ol>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpandedKey(key)}
            className="relative mt-auto flex cursor-pointer items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[.03] hover:text-foreground"
          >
            <ArrowDown className="size-3.5" />
            All {all.peak.length} ranked
          </button>
        </section>
      )}

      {!oneBoss && (
        <section aria-label="Boss boards" className="space-y-3">
          <h2 className="px-1 text-sm font-semibold">By boss</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {(bosses ?? allBosses).map((boss) => (
              <BossBoard key={boss} boss={boss} instanceName={instanceName} allBosses={allBosses} view={view} onOpen={() => onBoss(boss)} />
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
  theme,
  subtitle,
  lead,
  toolbar,
  children,
}: {
  oneBoss?: string
  title: string
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
            <h2 className="truncate font-wow text-xl leading-tight">{title}</h2>
            {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
          </div>
        </div>
        {toolbar}
        <div className="ml-auto flex items-center gap-3">{children}</div>
      </div>
    </>
  )
}

/** A board row: rank, guild with logo, what the score stands on, the score. EntryRow's guild twin. */
function GuildEntryRow({ rating: g, rank, theme }: { rating: GuildRating; rank: number; theme: MetricTheme }) {
  return (
    <li className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0">
      <RankMark rank={rank} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <GuildName guild={g.guild} logo={g.logo} />
        </span>
        <span className="block truncate pl-7 text-[11px] text-muted-foreground">
          {g.ms !== undefined ? `${formatClock(g.ms)} · ${g.date}` : g.detail}
        </span>
      </span>
      <span className="shrink-0 text-right font-mono text-sm tabular-nums" style={rank === 1 ? { color: theme.accent } : undefined}>
        {theme.format(g.score)}
      </span>
    </li>
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
  oneBoss,
  kindLabel,
  view,
  ratings,
  query,
  onQuery,
  onCollapse,
  toolbar,
}: {
  toolbar?: ReactNode
  label: string
  title: string
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
  const byGuild = (m: RatingMetric) => new Map(ratings[m].map((g) => [g.guild, g]))
  const scores = { peak: byGuild("peak"), mastery: byGuild("mastery"), renown: byGuild("renown") }
  const ranked = ratings[metric].map((g, i) => ({ rank: i + 1, g }))
  const needle = query.trim().toLowerCase()
  const rows = needle ? ranked.filter((r) => r.g.guild.toLowerCase().includes(needle)) : ranked
  const top = ranked[0]?.g.score ?? 1
  const timeLabel = oneBoss ? "Kill time" : kindLabel === "Bosses" ? "Total kill time" : "Clear time"

  return (
    <section aria-label={`${label} full list`} className="relative overflow-hidden rounded-xl border bg-card">
      <BoardHeader
        oneBoss={oneBoss}
        title={title}
        theme={theme}
        subtitle={`${ranked.length} guilds ranked`}
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
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="border-b bg-black/10 text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="w-14 px-4 py-2.5 text-left font-medium sm:px-5">#</th>
              <th className="w-px px-2 py-2.5 pr-8 text-left font-medium whitespace-nowrap">Guild</th>
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
                  <th className="w-32 px-3 py-2.5 text-left font-medium">{theme.label}</th>
                  {view === "mastery" && <MasteryPartHeaders />}
                  {view === "peak" && (
                    <>
                      <th className="px-3 py-2.5 text-right font-medium">{timeLabel}</th>
                      <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Date</th>
                    </>
                  )}
                  <th className="hidden px-3 py-2.5 pr-4 text-left font-medium sm:pr-5 lg:table-cell">Record</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rank, g }) => (
              <tr key={g.guild} className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[.025]">
                <td className="px-4 py-2 sm:px-5">
                  <RankMark rank={rank} size="sm" />
                </td>
                <td className="px-2 py-2 pr-8 whitespace-nowrap">
                  <span className="flex items-center gap-2.5 font-medium">
                    <GuildName guild={g.guild} logo={g.logo} size="size-6" />
                  </span>
                </td>
                {view === "overview" ? (
                  RATING_METRICS.map((m) => {
                    const score = scores[m].get(g.guild)
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
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-mono text-base tabular-nums" style={rank === 1 ? { color: theme.accent } : undefined}>
                          {theme.format(g.score)}
                        </span>
                        <span className="h-0.5 w-20 overflow-hidden rounded-full bg-white/5">
                          <span
                            className="block h-full rounded-full bg-[color:var(--metric)] opacity-60"
                            style={{ width: `${(g.score / top) * 100}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    {view === "mastery" && <MasteryPartCells parts={g.mastery} />}
                    {view === "peak" && (
                      <>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">
                          {g.ms !== undefined ? formatClock(g.ms) : "—"}
                        </td>
                        <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{g.date}</td>
                      </>
                    )}
                    <td className="hidden px-3 py-2 pr-4 text-xs text-muted-foreground sm:pr-5 lg:table-cell">{g.detail}</td>
                  </>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                  No guilds match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        {rows.length === 0 ? "0" : `1–${rows.length}`} of {rows.length}
      </div>
    </section>
  )
}

/** One boss: #1 per metric on the overview, top three on a single metric. */
function BossBoard({
  boss,
  instanceName,
  allBosses,
  view,
  onOpen,
}: {
  boss: string
  instanceName: string
  allBosses: readonly string[]
  view: RatingView
  onOpen: () => void
}) {
  const r = guildRatings([boss], allBosses, instanceName, 3)
  const rows = view === "overview" ? RATING_METRICS.map((m) => ({ metric: m, g: r[m][0] })) : r[view].map((g) => ({ metric: view, g }))
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={boss}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:border-white/20"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <BossPortrait boss={boss} size="sm" />
        <span className="truncate font-wow text-base group-hover:text-primary">{boss}</span>
      </div>
      <ol className="text-xs">
        {rows.map(({ metric, g }, i) => {
          const t = METRIC_THEMES[metric]
          return (
            <li key={metric + g.guild} className="flex items-center gap-2 px-3 py-1.5">
              {view === "overview" ? (
                <t.icon className="size-3.5 shrink-0" style={{ color: t.accent }} />
              ) : (
                <span className="w-3.5 font-mono text-[10px] text-muted-foreground">{i + 1}</span>
              )}
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <GuildName guild={g.guild} logo={g.logo} size="size-4" />
              </span>
              <span className="font-mono tabular-nums">{t.format(g.score)}</span>
            </li>
          )
        })}
      </ol>
    </button>
  )
}
