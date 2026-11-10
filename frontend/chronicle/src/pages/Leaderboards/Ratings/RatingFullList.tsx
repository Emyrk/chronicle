import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { ArrowDown, Check, ChevronLeft, ChevronRight, Info, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { MOBILE_EDGE_TO_EDGE } from "@/pages/Leaderboards/Hub/edgeToEdge"
import { HintTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip/tooltip"
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay"
import {
  RATING_METRICS,
  scopeEntries,
  type MasteryParts,
  type RatingEntry,
  type RatingMetric,
  type RatingPeriod,
  type RatingScope,
} from "./ratingBoards.fixtures"
import { BossPortrait, Emblem, RankMark, RawTag, ScopeMark, SpecIcon } from "./RatingParts"
import { ratingEntryAttributes } from "./ratingEntities"
import { METRIC_THEMES, type RatingView } from "./ratingThemes"
import { BOSS_PEAK_LABELS, type PeakComponentLabels, type RatingLiveData } from "./ratingLiveData"

const PAGE_SIZE = 50

interface FullRow {
  /** Rank within the scope before search/class filters, so filtering never renumbers. */
  rank: number
  entry: RatingEntry
  scores: Partial<Record<RatingMetric, RatingEntry>>
  peakComponents?: readonly { encounter_name: string; score: number }[]
  peakRun?: { ms: number; date: string; log?: string }
}

/**
 * The complete ranking for one scope. A single metric shows its record and score;
 * Overview shows all three scores and sorts by any of them.
 */
export function RatingFullList({
  scope,
  title,
  period,
  view,
  query,
  onQuery,
  onCollapse,
  toolbar,
  live,
  encounterCount = scope.boss ? 1 : 0,
}: {
  scope: RatingScope
  title: string
  encounterCount?: number
  period: RatingPeriod
  view: RatingView
  /** The search text, shared with the board header's search box. */
  query: string
  onQuery: (query: string) => void
  /** When the table was opened from the boards: the way back to them. */
  onCollapse?: () => void
  /** Metric switch and period, shown in the header next to the title. */
  toolbar?: ReactNode
  live?: RatingLiveData
}) {
  const [sortBy, setSortBy] = useState<RatingMetric>(view === "overview" ? "peak" : view)
  const [page, setPage] = useState(0)
  const metric = view === "overview" ? sortBy : view
  const showPeakComponents = view === "peak" && !!live && encounterCount > 1
  const showPeakRun = view === "peak" && encounterCount <= 1
  /** Single-metric boards: on a phone the score sits right-aligned, any extra columns folded under it. */
  const phoneFolds = view !== "overview"
  /** The single-boss peak's kill: published duration when live, else the row's (or fixture) run. */
  const runFor = (entry: RatingEntry, liveRun?: { ms: number; date: string; log?: string }): { ms?: number; date?: string; log?: string } =>
    live ? { ms: entry.durationMs, date: liveRun?.date, log: liveRun?.log } : liveRun ?? peakRun(entry.id, scope.boss)
  const theme = METRIC_THEMES[view]
  const peakLabels = live?.peakLabels ?? BOSS_PEAK_LABELS

  const fixtureRows = useMemo<FullRow[]>(() => {
    if (live) return []
    const byMetric = Object.fromEntries(RATING_METRICS.map((m) => [m, new Map(scopeEntries(m, period, scope).map((e) => [e.id, e]))])) as Record<
      RatingMetric,
      Map<string, RatingEntry>
    >
    return scopeEntries(metric, period, scope).map((entry, i) => ({
      rank: i + 1,
      entry,
      scores: Object.fromEntries(RATING_METRICS.map((m) => [m, byMetric[m].get(entry.id)])),
    }))
  }, [metric, period, scope, live])

  const selection = { scope, metric, period, cohort: live?.cohort, query, page }
  const published = useQuery({
    queryKey: ["hub-rating-full-list", live?.pageKey, scope, metric, period, query, page],
    queryFn: () => live!.loadPage!(selection),
    enabled: !!live?.loadPage,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
  const state = live?.loadPage
    ? published.isError ? { status: "error" as const, error: published.error?.message || "Published ratings unavailable." }
      : published.data ? { status: "ready" as const, data: published.data } : { status: "loading" as const }
    : live?.page?.(selection)
  const livePage = state?.status === "ready" ? state.data : undefined
  const rows: FullRow[] = livePage ? livePage.rows.map((row) => ({ ...row, scores: row.scores ?? {} })) : fixtureRows
  const top = rows[0]?.entry.score ?? 1
  const needle = query.trim().toLowerCase()
  const filtered = live ? rows : rows.filter(
    (r) => !needle || [r.entry.name, r.entry.guild, r.entry.spec, r.entry.subSpec].some((value) => value?.toLowerCase().includes(needle)),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = livePage?.page ?? Math.min(page, pages - 1)
  const visible = live ? filtered : filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const total = livePage?.total ?? (live ? visible.length : filtered.length)
  // Live boards without a global rank leave "#" empty; drop the column instead.
  const ranksShown = live?.ranksKnown !== false

  return (
    <section aria-label={`${title} ${theme.label} full list`} className={cn("overflow-hidden rounded-xl border bg-card", MOBILE_EDGE_TO_EDGE)}>
      <div className="@container relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 40% 120% at 0% 0%, color-mix(in oklab, var(--metric) 10%, transparent), transparent 70%)" }}
        />
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="relative -ml-1 inline-flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Back to boards
          </button>
        )}
        <div className="relative flex min-w-0 items-center gap-3">
          <Emblem size="sm" accent>
            {scope.boss || scope.cls ? <ScopeMark scope={scope} size="sm" /> : <theme.icon className="size-4 text-[color:var(--metric)]" />}
          </Emblem>
          <div className="min-w-0">
            <h2 className="truncate font-wow text-xl leading-tight">{title}</h2>
            {/* Only a known count earns a subtitle; "Published rankings" said nothing. */}
            {!(state && state.status !== "ready") && !(live && livePage?.total === undefined) && (
              <p className="text-xs text-muted-foreground">{total} ranked</p>
            )}
          </div>
        </div>
        {toolbar}
        {/* Narrow headers already wrap the search box; the question shares its line. Wide headers
            keep title, metrics, and search on one line, and the question sits below. */}
        {theme.question && (
          <p className="relative min-w-[14rem] flex-1 text-xs italic text-[color:var(--metric)] @min-[60rem]:order-last @min-[60rem]:basis-full">
            {theme.question}
          </p>
        )}
        <div className="relative ml-auto w-full sm:w-auto">
          <BoardSearch
            query={query}
            onQuery={(text) => {
              onQuery(text)
              setPage(0)
            }}
            autoFocus={query !== ""}
          />
        </div>
      </div>

      <div className="styled-scrollbar overflow-x-auto">
        {/* Every board folds its extra columns away on a phone, so only wider screens need the scroll width. */}
        <table className="w-full table-auto text-sm sm:min-w-[42rem]">
          <thead className="border-b bg-black/10 text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              {ranksShown && <th className="w-14 px-4 py-2.5 text-left font-medium sm:px-5">#</th>}
              <th className={cn("w-[22%] px-2 py-2.5 pr-2 text-left font-medium whitespace-nowrap sm:pr-6", !ranksShown && "pl-4 sm:pl-5")}>Character</th>
              {/* The ranking's own number sits next to the name; supporting columns follow to the right. */}
              {view === "overview" ? (
                <>
                {/* A phone gets all three scores in one column, in a fixed order with no re-sorting. */}
                <th className="px-3 py-2.5 pr-4 text-right font-medium tracking-normal whitespace-nowrap sm:hidden">
                  {RATING_METRICS.map((m, i) => (
                    <span key={m}>{i > 0 && " / "}<span style={{ color: METRIC_THEMES[m].accent }}>{METRIC_THEMES[m].label.replace("Ranked ", "")}</span></span>
                  ))}
                </th>
                {RATING_METRICS.map((m) => {
                  const t = METRIC_THEMES[m]
                  return (
                    <th key={m} className="hidden px-3 py-2.5 text-left font-medium whitespace-nowrap sm:table-cell">
                      <button
                        type="button"
                        onClick={() => {
                          setSortBy(m)
                          setPage(0)
                        }}
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
                      <HeaderHint {...METRIC_HINTS[m]} className="ml-1 align-middle" />
                    </th>
                  )
                })}
                </>
              ) : (
                <>
                  {/* Phones: the boss bars sit between the name and the right-aligned score. */}
                  {showPeakComponents && <th className="px-2 py-2.5 text-left font-medium capitalize sm:hidden">{peakLabels.noun}</th>}
                  <th className={cn("w-32 px-3 py-2.5 text-left font-medium", phoneFolds && "pr-4 text-right sm:pr-3 sm:text-left")}>
                    {theme.label}
                    <HeaderHint {...METRIC_HINTS[view]} className="ml-1 align-middle" />
                    {view === "mastery" && <span className="block text-[10px] tracking-normal normal-case opacity-70 sm:hidden">Peak / Form / Floor · kills</span>}
                  </th>
                  {view === "mastery" && (live ? <PublishedMasteryHeaders /> : <MasteryPartHeaders />)}
                  {showPeakComponents && (
                    <th className="hidden w-[28%] px-3 py-2.5 text-left font-medium sm:table-cell" title={peakLabels.description(encounterCount)}>
                      {peakLabels.header} <span className="ml-1 hidden tracking-normal normal-case opacity-70 md:inline">· {peakLabels.note(encounterCount)}</span>
                    </th>
                  )}
                  {showPeakRun && (
                    <>
                      {live && <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">{rows[0]?.entry.rawMetric ?? "DPS/HPS"}</th>}
                      <th className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Kill time</th>
                      <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Date</th>
                    </>
                  )}
                </>
              )}
              <th className="hidden w-48 whitespace-nowrap px-3 py-2.5 text-left font-medium lg:table-cell">Realm</th>
              {/* Renown counts kills per character, not per spec, so its rows have no spec to show. */}
              {view !== "renown" && (
                <>
                  <th className="hidden w-40 px-2 py-2.5 text-left font-medium md:table-cell">Spec</th>
                  <th className="hidden w-36 px-2 py-2.5 pr-4 text-left font-medium sm:pr-5 md:table-cell">Sub-spec</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {state && state.status !== "ready" && (
              <tr><td colSpan={9} role={state.status === "error" ? "alert" : "status"} className="px-5 py-10 text-center text-muted-foreground">
                {state.status === "error" ? state.error : "Loading published ratings…"}
              </td></tr>
            )}
            {visible.map(({ rank, entry, scores, peakComponents, peakRun: liveRun }) => (
              <tr key={entry.id} className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[.025]">
                {ranksShown && (
                  <td className="px-4 py-2 sm:px-5">
                    <RankMark rank={rank} size="sm" />
                  </td>
                )}
                <td className={cn("px-2 py-2 pr-2 whitespace-nowrap sm:pr-8", !ranksShown && "pl-4 sm:pl-5")}>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SpecIcon cls={entry.cls} spec={entry.spec} className="size-6 shrink-0 rounded-sm" />
                    <div className="min-w-0">
                      <span className="block font-medium" style={{ color: CLASS_CSS_VAR[entry.cls] }} {...ratingEntryAttributes(entry)}>
                        {entry.name}
                      </span>
                      {(() => {
                        // The second line: spec (phones only; wider screens have a Spec column) and guild.
                        const spec = [entry.spec, entry.subSpec].filter(Boolean).join(" · ")
                        if (!spec && !entry.guild) return null
                        return (
                          <div className="flex min-w-[7rem] text-[11px] text-muted-foreground sm:min-w-[8.5rem]">
                            {spec && <span className="shrink-0 md:hidden">{spec}</span>}
                            {/* Zero-width basis: past the line's minimum width the guild never widens the
                                column; it fills the room the name and spec leave and truncates. */}
                            {entry.guild && (
                              <span className="w-0 min-w-0 flex-1 truncate" title={entry.guild}>
                                {spec && <span className="md:hidden">{"\u00a0·\u00a0"}</span>}&lt;{entry.guild}&gt;
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </td>
                {view === "overview" ? (
                  <>
                  <td className="px-3 py-2 pr-4 text-right font-mono whitespace-nowrap tabular-nums sm:hidden">
                    {RATING_METRICS.map((m, i) => {
                      const score = scores[m]
                      return (
                        <span key={m}>
                          {i > 0 && <span className="text-muted-foreground">/</span>}
                          {/* Fixed-width slots so every row's slashes line up: XXX.X for the ratings, and room
                              for a five-digit Renown count. */}
                          <span style={score ? { color: METRIC_THEMES[m].accent } : undefined} className={cn("inline-block text-right", m === "renown" ? "w-[6ch]" : "w-[5ch]", !score && "text-muted-foreground")}>
                            {score ? METRIC_THEMES[m].format(score.score) : "—"}
                          </span>
                        </span>
                      )
                    })}
                  </td>
                  {RATING_METRICS.map((m) => {
                    const score = scores[m]
                    return (
                      <td
                        key={m}
                        className={cn("hidden px-3 py-2 font-mono tabular-nums sm:table-cell", sortBy !== m && "text-muted-foreground")}
                        style={sortBy === m && rank === 1 ? { color: METRIC_THEMES[m].accent } : undefined}
                      >
                        {score ? METRIC_THEMES[m].format(score.score) : <span title="No performance summary in the selected role and cohort filters">—</span>}
                        {score?.cohortLabel && <span className="mt-0.5 block text-[10px] text-muted-foreground" title={`Best whole-selection ${METRIC_THEMES[m].label}: ${score.cohortLabel}`}>{score.cohortLabel}</span>}
                        {m === "peak" && score?.raw ? <RawTag raw={score.raw} className="ml-1.5" /> : null}
                      </td>
                    )
                  })}
                  </>
                ) : (
                  <>
                    {showPeakComponents && <td className="px-2 py-2 sm:hidden"><PeakComponents entry={entry} scores={peakComponents} labels={peakLabels} /></td>}
                    <td className={cn("px-3 py-2", phoneFolds && "pr-4 sm:pr-3")}>
                      <div className={cn("flex flex-col items-start gap-1", phoneFolds && "items-end sm:items-start")}>
                        <span className="font-mono text-base tabular-nums" style={rank === 1 ? { color: theme.accent } : undefined}>
                          {theme.format(entry.score)}
                          {/* A phone moves the raw number under the score, beside the kill time. */}
                          {view === "peak" && entry.raw ? <RawTag raw={entry.raw} className="ml-2 hidden sm:inline" /> : null}
                        </span>
                        <span className="h-0.5 w-20 overflow-hidden rounded-full bg-white/5">
                          <span
                            className="block h-full rounded-full bg-[color:var(--metric)] opacity-60"
                            style={{ width: `${(entry.score / top) * 100}%` }}
                          />
                        </span>
                        {view === "peak" && (() => {
                          const ms = showPeakRun ? runFor(entry, liveRun).ms : undefined
                          const parts = [entry.raw ? `${Math.round(entry.raw).toLocaleString()}/s` : undefined, ms === undefined ? undefined : formatClock(ms)].filter(Boolean)
                          return parts.length ? <span className="font-mono text-[11px] text-muted-foreground tabular-nums sm:hidden">{parts.join(" · ")}</span> : null
                        })()}
                        {view === "mastery" && <MasteryPhoneLine entry={entry} live={!!live} />}
                      </div>
                    </td>
                    {view === "mastery" && (live ? <PublishedMasteryCells entry={entry} /> : <MasteryPartCells parts={entry.mastery} />)}
                    {showPeakComponents && <td className="hidden px-3 py-2 sm:table-cell"><PeakComponents entry={entry} scores={peakComponents} labels={peakLabels} /></td>}
                    {showPeakRun && (() => {
                      const run = runFor(entry, liveRun)
                      return <>
                        {live && <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground tabular-nums sm:table-cell">{entry.raw === undefined ? "Unavailable" : entry.raw.toFixed(1)}</td>}
                        <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground tabular-nums sm:table-cell">{run.ms === undefined ? <span title="Peak encounter duration has not been recorded for this summary.">Unavailable</span> : formatClock(run.ms)}</td>
                        <td className="hidden px-3 py-2 text-xs whitespace-nowrap text-muted-foreground sm:table-cell">
                          {/* The date opens the log the peak kill came from, while that log is listed. */}
                          {run.date && run.log ? (
                            <Link to={`/instances/${run.log}`} className="underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground">
                              {run.date}
                            </Link>
                          ) : (run.date ?? "Unavailable")}
                        </td>
                      </>
                    })()}
                  </>
                )}
                <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground lg:table-cell">{entry.realmLabel || "Unknown realm"}</td>
                {view !== "renown" && (
                  <>
                    <td className="hidden px-2 py-2 text-muted-foreground md:table-cell"><span className="inline-flex items-center gap-1.5 whitespace-nowrap">{entry.spec && <SpecIcon cls={entry.cls} spec={entry.spec} className="size-4 shrink-0 rounded-sm" />}<span>{entry.spec || "—"}</span></span></td>
                    <td className="hidden px-2 py-2 pr-4 text-muted-foreground sm:pr-5 md:table-cell">{entry.subSpec}</td>
                  </>
                )}
              </tr>
            ))}
            {(!state || state.status === "ready") && visible.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                  No characters match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        <span>
          {live?.ranksKnown === false ? `${visible.length} results · no global ranks` : live && query.trim()
            ? `${visible.length ? `${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + visible.length}` : "0"} of ${total} matches${visible.length ? ` · global ranks ${visible[0].rank}–${visible[visible.length - 1].rank}` : ""}`
            : `${visible.length === 0 ? "0" : live ? `${visible[0].rank}–${visible[visible.length - 1].rank}` : `${current * PAGE_SIZE + 1}–${Math.min((current + 1) * PAGE_SIZE, filtered.length)}`} of ${live && livePage?.total === undefined ? "published ratings" : total}`}
        </span>
        <div className="flex items-center gap-1">
          <PageButton disabled={live ? !livePage?.hasPreviousPage : current === 0} onClick={() => setPage(current - 1)} label="Previous page">
            <ChevronLeft className="size-4" />
          </PageButton>
          <span className="px-2 tabular-nums">
            {current + 1}{live && livePage?.total === undefined ? "" : ` / ${live ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : pages}`}
          </span>
          <PageButton disabled={live ? !livePage?.hasNextPage : current >= pages - 1} onClick={() => setPage(current + 1)} label="Next page">
            <ChevronRight className="size-4" />
          </PageButton>
        </div>
      </div>
    </section>
  )
}

type BossPeak = { encounter_name: string; score: number }

/**
 * Every boss's best score as one bar each; the row's Peak is their mean, misses counted as 0.
 * Clicking opens the full per-boss breakdown in a dialog.
 */
export function PeakComponents({ entry, scores, labels = BOSS_PEAK_LABELS }: { entry: RatingEntry; scores?: readonly BossPeak[]; labels?: PeakComponentLabels }) {
  if (!scores?.length) return <span className="text-muted-foreground">—</span>
  const missed = scores.filter((boss) => boss.score <= 0).length
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`${labels.header} for ${entry.name}`}
            className="flex cursor-pointer items-center gap-2 rounded-md border border-white/[.07] bg-black/20 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-white/15 hover:text-foreground md:gap-3 md:px-2.5 md:py-1.5"
          >
            {/* One bar per boss: a glance at the shape before opening the breakdown. */}
            <span aria-hidden className="flex h-4 items-end gap-px md:h-6 md:gap-0.5">
              {scores.map((boss) => (
                <span
                  key={boss.encounter_name}
                  title={`${boss.encounter_name}: ${boss.score > 0 ? METRIC_THEMES.peak.format(boss.score) : "no kill"}`}
                  className={cn("w-1 rounded-[1px] md:w-2", boss.score > 0 ? "bg-[color:var(--metric)]" : "h-px bg-white/20")}
                  style={boss.score > 0 ? { height: `${Math.max(12, Math.min(100, boss.score))}%`, opacity: boss.score >= 100 ? 0.9 : 0.55 } : undefined}
                />
              ))}
            </span>
            {/* Phones show the bars alone; the breakdown dialog still names every boss. */}
            <span className="hidden whitespace-nowrap sm:inline">{scores.length} {labels.noun}{missed ? ` · ${missed} missed` : ""}</span>
            <ChevronRight className="size-3.5" />
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0" style={{ "--metric": METRIC_THEMES.peak.accent } as CSSProperties}>
          <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
            <DialogTitle className="flex items-baseline gap-2">
              <span style={{ color: CLASS_CSS_VAR[entry.cls] }}>{entry.name}</span>
              <span className="font-mono text-[color:var(--metric)] tabular-nums">{METRIC_THEMES.peak.format(entry.score)}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">
              {labels.description(scores.length)}
            </DialogDescription>
          </DialogHeader>
          <ul className="styled-scrollbar grid gap-1.5 overflow-y-auto px-5 py-4">
            {scores.map((boss) => {
              const miss = boss.score <= 0
              return (
                <li key={boss.encounter_name} className={cn("flex items-center gap-3", miss && "text-muted-foreground/60")}>
                  <BossPortrait boss={boss.encounter_name} size="sm" className={cn("shrink-0", miss && "opacity-50")} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">{boss.encounter_name}</span>
                      <span className={cn("font-mono text-xs tabular-nums", boss.score >= 100 && "text-[color:var(--metric)]")}>
                        {miss ? "no kill" : METRIC_THEMES.peak.format(boss.score)}
                      </span>
                    </div>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/5">
                      <span className="block h-full rounded-full bg-[color:var(--metric)] opacity-60" style={{ width: `${Math.min(100, boss.score)}%` }} />
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** A phone's one-line Mastery breakdown under the score: Peak/Form/Floor in fixed slots, then kill coverage. */
function MasteryPhoneLine({ entry, live }: { entry: RatingEntry; live: boolean }) {
  let values: (number | undefined)[]
  let coverage: number | undefined
  if (live) {
    const parts = entry.publishedMastery
    values = [parts?.peak, parts?.form, parts?.floor]
    const counts = entry.bossCounts
    coverage = counts?.length ? counts.reduce((sum, boss) => sum + Math.min(boss.count, 3), 0) / (3 * counts.length) : undefined
  } else {
    values = [entry.mastery?.peak, entry.mastery?.form, entry.mastery?.floor]
    coverage = entry.mastery?.evidence
  }
  return (
    <span className="font-mono text-[11px] whitespace-nowrap text-muted-foreground tabular-nums sm:hidden">
      {values.map((value, i) => (
        <span key={i}>
          {i > 0 && "/"}
          <span className="inline-block w-[5ch] text-right">{value === undefined ? "—" : value.toFixed(1)}</span>
        </span>
      ))}
      {coverage !== undefined && <><span className="mx-0.5">·</span><span className="inline-block w-[4ch] text-right">{Math.min(100, Math.round(coverage * 100))}%</span></>}
    </span>
  )
}

/** What each rating means, for its column header's hint. Ratings are raw DPS/HPS against the benchmark, never parses. */
const METRIC_HINTS: Record<RatingMetric, { title: string; body: string }> = {
  peak: {
    title: "Peak",
    body: "Your best DPS/HPS on the boss against the benchmark: the rank-1 DPS/HPS for your spec. If someone beats the benchmark, your Peak goes down. Across several bosses it averages each boss's Peak, and a boss without a kill counts as 0.",
  },
  mastery: {
    title: "Ranked Mastery",
    body: "30% Peak + 50% Form + 20% Floor, each your DPS/HPS against the benchmark for your spec. Form and Floor count as 0 until you have three kills of a boss, so it rewards repeated strong kills, not one great one. Across several bosses it averages them, and a missed boss counts as 0.",
  },
  renown: {
    title: "Renown",
    body: "Content done: every kill of a selected boss earns that boss's points, summed across bosses, all-time. It does not depend on DPS/HPS, the benchmark, or class filters.",
  },
}

/** A hover (or focus) hint beside a column header: a small info icon that explains the column. */
function HeaderHint({ title, body, className }: { title: string; body: string; className?: string }) {
  return (
    <HintTooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} role="img" aria-label={`${title}: ${body}`} className={cn("inline-flex cursor-help", className)}>
          <Info className="size-3 opacity-60" aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-xs space-y-1 p-3 text-left tracking-normal normal-case">
        <p className="font-semibold">{title}</p>
        <p className="leading-relaxed text-zinc-300">{body}</p>
      </TooltipContent>
    </HintTooltip>
  )
}

/**
 * What each Mastery part means, per boss. Nothing here is a parse: every part is the row's raw DPS/HPS
 * against the boss benchmark (the rank-1 DPS/HPS for its spec), so all three fall when the benchmark
 * is beaten. A multi-boss row averages bosses, misses counting as 0.
 */
const PUBLISHED_MASTERY_COLUMNS: { label: string; title: string; body: string }[] = [
  { label: "Peak", title: "Peak · 30% of Mastery", body: "Your best DPS/HPS on the boss against the benchmark: the rank-1 DPS/HPS for your spec. If someone beats the benchmark, your Peak goes down." },
  { label: "Form", title: "Form · 50% of Mastery", body: "Your typical good kill: the average DPS/HPS of your kills above the 40th percentile, leaving out your best, against the benchmark for your spec." },
  { label: "Floor", title: "Floor · 20% of Mastery", body: "Your off nights: the average DPS/HPS of your 20th–40th percentile kills against the benchmark for your spec. Your bottom 20% of kills are ignored." },
  { label: "3-kill progress", title: "3-kill progress", body: "Kills toward three per selected boss. Form and Floor need at least three kills of a boss and count as 0 until then. This is coverage, not your score." },
]

export function PublishedMasteryHeaders() {
  return (
    <>
      {PUBLISHED_MASTERY_COLUMNS.map((column) => (
        <th key={column.label} className="hidden px-3 py-2.5 text-right font-medium whitespace-nowrap sm:table-cell">
          {column.label}
          <HeaderHint title={column.title} body={column.body} className="ml-1 align-middle" />
        </th>
      ))}
    </>
  )
}

export function PublishedMasteryCells({ entry }: { entry: RatingEntry }) {
  const parts = entry.publishedMastery
  const cells = [parts?.peak, parts?.form, parts?.floor]
  const counts = entry.bossCounts
  const progress = counts?.length ? counts.reduce((sum, boss) => sum + Math.min(boss.count, 3), 0) / (3 * counts.length) : 0
  const missing = counts?.filter((boss) => boss.count < 3) ?? []
 const description = !counts ? "No boss counts available" : !counts.length ? "No selected bosses" : missing.length
   ? `Missing eligible kills: ${missing.map((boss) => `${boss.encounter_name}: ${3 - boss.count} more (${boss.count}/3)`).join("; ")}`
   : "Complete: at least three eligible kills for every selected boss"
 const explanation = "Counts apply to this row's cohort and DPS/HPS metric. This is coverage progress, not your Mastery score."
  return <>{cells.map((value, i) => <td key={i} className="hidden px-3 py-2 text-right font-mono text-muted-foreground tabular-nums sm:table-cell">{value === undefined ? "—" : value.toFixed(1)}</td>)}
    <td className="hidden px-3 py-2 text-right font-mono text-muted-foreground tabular-nums sm:table-cell"><HintTooltip>
      <TooltipTrigger asChild><span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-4" aria-label={`Progress toward three kills per selected boss: ${description}. ${explanation}`}>{counts ? `${Math.round(progress * 100)}%` : "—"}</span></TooltipTrigger>
      <TooltipContent side="top" sideOffset={6} className="max-w-sm space-y-2 p-3 text-left">
        <p className="font-semibold">{missing.length ? "Kills needed for 100% coverage" : description}</p>
        {missing.length > 0 && <ul className="max-h-60 space-y-1 overflow-y-auto styled-scrollbar">{missing.map((boss) => <li key={boss.encounter_name} className="flex justify-between gap-4"><span>{boss.encounter_name}</span><span className="shrink-0 font-mono">{3 - boss.count} more · {boss.count}/3</span></li>)}</ul>}
        <p className="text-zinc-300 leading-relaxed">{explanation}</p>
      </TooltipContent>
    </HintTooltip></td>
  </>

}

function PageButton({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="cursor-pointer flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** "Find character or guild": in the board header, and in the table once it is open. */
export function BoardSearch({ query, onQuery, autoFocus }: { query: string; onQuery: (query: string) => void; autoFocus?: boolean }) {
  return (
    <label className="relative flex w-full items-center sm:w-64">
      <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        // Typing in the board header opens the table; keep the cursor in the box that replaces it.
        autoFocus={autoFocus}
        placeholder="Find character or guild"
        aria-label="Find character or guild"
        className="h-9 w-full rounded-md border bg-background/60 pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
    </label>
  )
}

/**
 * Mock: the kill behind a Peak score. On a boss, that kill's time and date; across the raid, the best
 * kills' summed time and the latest of their dates. Production reads these from the scored kills.
 */
function peakRun(id: string, boss: string | undefined): { ms: number; date: string } {
  let h = 2166136261
  for (const ch of `${id}|${boss ?? "raid"}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const r = (h >>> 0) / 4294967296
  const ms = boss ? 70_000 + r * 130_000 : 17 * 60_000 + r * 9 * 60_000
  const day = new Date(Date.UTC(2026, 5, 1) + Math.floor(r * 150) * 86_400_000)
  return { ms: Math.round(ms), date: day.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) }
}

function formatClock(ms: number) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Ranked Mastery's parts, right of the score: 30% Peak + 50% Form + 20% Floor is the estimate, and
 * Evidence is how much of the five kills per boss that end the ranking discount are in.
 */
export function MasteryPartHeaders() {
  return (
    <>
      {[
        ["Peak", "Best DPS/HPS against the benchmark"],
        ["Form", "Typical DPS/HPS against the benchmark"],
        ["Floor", "The lower end of play"],
        ["Evidence", "Kills toward the five per boss that end the ranking discount. Across a raid: every boss counts."],
      ].map(([label, hint]) => (
        <th key={label} title={hint} className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">
          {label}
        </th>
      ))}
    </>
  )
}

export function MasteryPartCells({ parts }: { parts?: MasteryParts }) {
  if (!parts) return <td colSpan={4} className="hidden sm:table-cell" />
  const cell = "hidden px-3 py-2 text-right font-mono text-muted-foreground tabular-nums sm:table-cell"
  const percent = Math.round(parts.evidence * 100)
  return (
    <>
      <td className={cell}>{parts.peak.toFixed(1)}</td>
      <td className={cell}>{parts.form.toFixed(1)}</td>
      <td className={cell}>{parts.floor.toFixed(1)}</td>
      <td className={cell}>
        {percent >= 100 ? (
          <span className="inline-flex text-green-500" title={`Complete: ${parts.kills} kills`} aria-label="Evidence complete">
            <Check className="size-4" />
          </span>
        ) : (
          <span title={`${parts.kills} kills: the score is still discounted`}>{percent}%</span>
        )}
      </td>
    </>
  )
}
