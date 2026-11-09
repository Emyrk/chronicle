import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { ArrowDown, Check, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
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
import type { RatingLiveData } from "./ratingLiveData"

const PAGE_SIZE = 50

interface FullRow {
  /** Rank within the scope before search/class filters, so filtering never renumbers. */
  rank: number
  entry: RatingEntry
  scores: Partial<Record<RatingMetric, RatingEntry>>
  peakComponents?: readonly { encounter_name: string; score: number }[]
  peakRun?: { ms: number; date: string }
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
  const theme = METRIC_THEMES[view]

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

  return (
    <section aria-label={`${title} ${theme.label} full list`} className="overflow-hidden rounded-xl border bg-card">
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3">
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
            <p className="text-xs text-muted-foreground">{state && state.status !== "ready" ? "Published ratings" : live && livePage?.total === undefined ? "Published rankings" : `${total} ranked`}
              {theme.question && <span className="hidden sm:inline"> · {theme.question}</span>}
            </p>
          </div>
        </div>
        {toolbar}
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
        <table className="w-full min-w-[42rem] table-auto text-sm">
          <thead className="border-b bg-black/10 text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="w-14 px-4 py-2.5 text-left font-medium sm:px-5">#</th>
              <th className="w-[22%] px-2 py-2.5 pr-6 text-left font-medium whitespace-nowrap">Character</th>
              {/* The ranking's own number sits next to the name; supporting columns follow to the right. */}
              {view === "overview" ? (
                RATING_METRICS.map((m) => {
                  const t = METRIC_THEMES[m]
                  return (
                    <th key={m} className="px-3 py-2.5 text-left font-medium">
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
                    </th>
                  )
                })
              ) : (
                <>
                  <th className="w-32 px-3 py-2.5 text-left font-medium">{theme.label}</th>
                  {view === "mastery" && (live ? <PublishedMasteryHeaders /> : <MasteryPartHeaders />)}
                  {showPeakComponents && (
                    <th className="w-[28%] px-3 py-2.5 text-left font-medium" title="Peak is the mean of every boss's best score; a boss without a kill counts as 0.">
                      Boss peaks <span className="ml-1 hidden tracking-normal normal-case opacity-70 md:inline">· mean of {encounterCount}, misses count 0</span>
                    </th>
                  )}
                  {showPeakRun && (
                    <>
                      {live && <th className="px-3 py-2.5 text-right font-medium">{rows[0]?.entry.rawMetric ?? "DPS/HPS"}</th>}
                      <th className="px-3 py-2.5 text-right font-medium">Kill time</th>
                      <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">Date</th>
                    </>
                  )}
                </>
              )}
              <th className="hidden w-48 whitespace-nowrap px-3 py-2.5 text-left font-medium lg:table-cell">Realm</th>
              <th className="hidden w-40 px-2 py-2.5 text-left font-medium md:table-cell">Spec</th>
              <th className="hidden w-36 px-2 py-2.5 pr-4 text-left font-medium sm:pr-5 md:table-cell">Sub-spec</th>
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
                <td className="px-4 py-2 sm:px-5">
                  {live?.ranksKnown !== false && <RankMark rank={rank} size="sm" />}
                </td>
                <td className="px-2 py-2 pr-8 whitespace-nowrap">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SpecIcon cls={entry.cls} spec={entry.spec} className="size-6 shrink-0 rounded-sm" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 font-medium" style={{ color: CLASS_CSS_VAR[entry.cls] }} {...ratingEntryAttributes(entry)}>
                          {entry.name}
                        </span>
                        {entry.guild && <span className="truncate text-xs text-muted-foreground">&lt;{entry.guild}&gt;</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground md:hidden">
                        {entry.spec} · {entry.subSpec}
                      </div>
                    </div>
                  </div>
                </td>
                {view === "overview" ? (
                  RATING_METRICS.map((m) => {
                    const score = scores[m]
                    return (
                      <td
                        key={m}
                        className={cn("px-3 py-2 font-mono tabular-nums", sortBy !== m && "text-muted-foreground")}
                        style={sortBy === m && rank === 1 ? { color: METRIC_THEMES[m].accent } : undefined}
                      >
                        {score ? METRIC_THEMES[m].format(score.score) : <span title="No performance summary in the selected role and cohort filters">—</span>}
                        {score?.cohortLabel && <span className="mt-0.5 block text-[10px] text-muted-foreground" title={`Best whole-selection ${METRIC_THEMES[m].label}: ${score.cohortLabel}`}>{score.cohortLabel}</span>}
                        {m === "peak" && score?.raw ? <RawTag raw={score.raw} className="ml-1.5" /> : null}
                      </td>
                    )
                  })
                ) : (
                  <>
                    <td className="px-3 py-2">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-mono text-base tabular-nums" style={rank === 1 ? { color: theme.accent } : undefined}>
                          {theme.format(entry.score)}
                          {view === "peak" && entry.raw ? <RawTag raw={entry.raw} className="ml-2" /> : null}
                        </span>
                        <span className="h-0.5 w-20 overflow-hidden rounded-full bg-white/5">
                          <span
                            className="block h-full rounded-full bg-[color:var(--metric)] opacity-60"
                            style={{ width: `${(entry.score / top) * 100}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    {view === "mastery" && (live ? <PublishedMasteryCells entry={entry} /> : <MasteryPartCells parts={entry.mastery} />)}
                    {showPeakComponents && <td className="px-3 py-2"><PeakComponents entry={entry} scores={peakComponents} /></td>}
                    {showPeakRun && (() => {
                      const run = live ? { ms: entry.durationMs, date: liveRun?.date } : liveRun ?? peakRun(entry.id, scope.boss)
                      return <>
                        {live && <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">{entry.raw === undefined ? "Unavailable" : entry.raw.toFixed(1)}</td>}
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">{run.ms === undefined ? <span title="Peak encounter duration has not been recorded for this summary.">Unavailable</span> : formatClock(run.ms)}</td>
                        <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{run.date ?? "Unavailable"}</td>
                      </>
                    })()}
                  </>
                )}
                <td className="hidden whitespace-nowrap px-3 py-2 text-xs text-muted-foreground lg:table-cell">{entry.realmLabel || "Unknown realm"}</td>
                <td className="hidden px-2 py-2 text-muted-foreground md:table-cell"><span className="inline-flex items-center gap-1.5 whitespace-nowrap">{entry.spec && <SpecIcon cls={entry.cls} spec={entry.spec} className="size-4 shrink-0 rounded-sm" />}<span>{entry.spec || "—"}</span></span></td>
                <td className="hidden px-2 py-2 pr-4 text-muted-foreground sm:pr-5 md:table-cell">{entry.subSpec}</td>
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
export function PeakComponents({ entry, scores }: { entry: RatingEntry; scores?: readonly BossPeak[] }) {
  if (!scores?.length) return <span className="text-muted-foreground">—</span>
  const missed = scores.filter((boss) => boss.score <= 0).length
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            aria-label={`Boss peaks for ${entry.name}`}
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
            <span className="whitespace-nowrap">{scores.length} bosses{missed ? ` · ${missed} missed` : ""}</span>
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
              Peak is the mean of all {scores.length} bosses' best scores; a boss without a kill counts as 0.
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

export function PublishedMasteryHeaders() {
 return <>{["Peak", "Form", "Floor", "3-kill progress"].map(label => <th key={label} className="px-3 py-2.5 text-right font-medium">{label}</th>)}</>
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
  return <>{cells.map((value, i) => <td key={i} className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums">{value === undefined ? "—" : value.toFixed(1)}</td>)}
    <td className="px-3 py-2 text-right font-mono text-muted-foreground tabular-nums"><HintTooltip>
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
        ["Peak", "Best parse"],
        ["Form", "Typical recent parse"],
        ["Floor", "The lower end of play"],
        ["Evidence", "Kills toward the five per boss that end the ranking discount. Across a raid: every boss counts."],
      ].map(([label, hint]) => (
        <th key={label} title={hint} className="px-3 py-2.5 text-right font-medium">
          {label}
        </th>
      ))}
    </>
  )
}

export function MasteryPartCells({ parts }: { parts?: MasteryParts }) {
  if (!parts) return <td colSpan={4} />
  const cell = "px-3 py-2 text-right font-mono text-muted-foreground tabular-nums"
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
