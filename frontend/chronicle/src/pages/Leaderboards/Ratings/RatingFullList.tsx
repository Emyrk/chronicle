import { useMemo, useState } from "react"
import { ArrowDown, ChevronLeft, ChevronRight, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import {
  CLASS_ORDER,
  RATING_METRICS,
  scopeEntries,
  type RatingEntry,
  type RatingMetric,
  type RatingPeriod,
  type RatingScope,
} from "./ratingBoards.fixtures"
import { Emblem, RankMark, ScopeMark, SpecIcon } from "./RatingParts"
import { METRIC_THEMES, type RatingView } from "./ratingThemes"

const PAGE_SIZE = 50

interface FullRow {
  /** Rank within the scope before search/class filters, so filtering never renumbers. */
  rank: number
  entry: RatingEntry
  scores: Partial<Record<RatingMetric, RatingEntry>>
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
}: {
  scope: RatingScope
  title: string
  period: RatingPeriod
  view: RatingView
}) {
  const [sortBy, setSortBy] = useState<RatingMetric>(view === "overview" ? "peak" : view)
  const [query, setQuery] = useState("")
  const [cls, setCls] = useState<string | undefined>()
  const [page, setPage] = useState(0)
  const metric = view === "overview" ? sortBy : view
  const theme = METRIC_THEMES[view]

  const rows = useMemo<FullRow[]>(() => {
    const byMetric = Object.fromEntries(
      RATING_METRICS.map((m) => [m, new Map(scopeEntries(m, period, scope).map((e) => [e.id, e]))]),
    ) as Record<RatingMetric, Map<string, RatingEntry>>
    return scopeEntries(metric, period, scope).map((entry, i) => ({
      rank: i + 1,
      entry,
      scores: Object.fromEntries(RATING_METRICS.map((m) => [m, byMetric[m].get(entry.id)])),
    }))
  }, [metric, period, scope])

  const top = rows[0]?.entry.score ?? 1
  const needle = query.trim().toLowerCase()
  const filtered = rows.filter(
    (r) =>
      (!cls || r.entry.cls === cls) &&
      (!needle || [r.entry.name, r.entry.guild, r.entry.spec, r.entry.subSpec].some((value) => value?.toLowerCase().includes(needle))),
  )
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pages - 1)
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
  const classes = scope.cls ? [] : CLASS_ORDER.filter((c) => rows.some((r) => r.entry.cls === c))

  return (
    <section aria-label={`${title} ${theme.label} full list`} className="overflow-hidden rounded-xl border bg-card">
      <div className="relative flex flex-wrap items-center gap-4 border-b px-4 py-4 sm:px-5">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(ellipse 40% 120% at 0% 0%, color-mix(in oklab, var(--metric) 10%, transparent), transparent 70%)" }}
        />
        <Emblem size="sm" accent>
          {Object.keys(scope).length > 0 ? <ScopeMark scope={scope} size="sm" /> : <theme.icon className="size-4 text-[color:var(--metric)]" />}
        </Emblem>
        <div className="relative min-w-0">
          <h2 className="font-wow text-xl">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {theme.label} · {rows.length} ranked
          </p>
        </div>
        <label className="relative ml-auto flex w-full items-center sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Find character or guild"
            aria-label="Find character or guild"
            className="h-9 w-full rounded-md border bg-background/60 pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
          />
        </label>
      </div>

      {classes.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5 sm:px-5" role="group" aria-label="Class filter">
          <FilterChip active={!cls} onClick={() => { setCls(undefined); setPage(0) }}>All classes</FilterChip>
          {classes.map((c) => (
            <FilterChip key={c} active={cls === c} onClick={() => { setCls(cls === c ? undefined : c); setPage(0) }} label={CLASS_DISPLAY[c]}>
              <ClassIcon cls={c} className="size-4 rounded-sm" />
            </FilterChip>
          ))}
        </div>
      )}

      <div className="styled-scrollbar overflow-x-auto">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="border-b bg-black/10 text-[11px] tracking-wider text-muted-foreground uppercase">
            <tr>
              <th className="w-14 px-4 py-2.5 text-left font-medium sm:px-5">#</th>
              <th className="px-2 py-2.5 text-left font-medium">Character</th>
              <th className="hidden px-2 py-2.5 text-left font-medium md:table-cell">Spec</th>
              <th className="hidden px-2 py-2.5 text-left font-medium md:table-cell">Sub-spec</th>
              {view === "overview" ? (
                RATING_METRICS.map((m) => {
                  const t = METRIC_THEMES[m]
                  return (
                    <th key={m} className="px-2 py-2.5 text-right font-medium last:pr-4 sm:last:pr-5">
                      <button
                        type="button"
                        onClick={() => { setSortBy(m); setPage(0) }}
                        aria-pressed={sortBy === m}
                        className={cn("inline-flex items-center gap-1 uppercase transition-colors hover:text-foreground", sortBy === m && "text-foreground")}
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
                  <th className="hidden px-2 py-2.5 text-left font-medium sm:table-cell">Record</th>
                  <th className="w-40 px-4 py-2.5 text-right font-medium sm:px-5">{theme.label}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ rank, entry, scores }) => (
              <tr key={entry.id} className="border-b border-white/5 transition-colors last:border-b-0 hover:bg-white/[.025]">
                <td className="px-4 py-2 sm:px-5">
                  <RankMark rank={rank} size="sm" />
                </td>
                <td className="px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <SpecIcon cls={entry.cls} spec={entry.spec} className="size-6 shrink-0 rounded-sm" />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <span className="shrink-0 font-medium" style={{ color: CLASS_CSS_VAR[entry.cls] }}>{entry.name}</span>
                        {entry.guild && <span className="truncate text-xs text-muted-foreground">&lt;{entry.guild}&gt;</span>}
                      </div>
                      <div className="text-[11px] text-muted-foreground md:hidden">{entry.spec} · {entry.subSpec}</div>
                    </div>
                  </div>
                </td>
                <td className="hidden px-2 py-2 text-muted-foreground md:table-cell">{entry.spec}</td>
                <td className="hidden px-2 py-2 text-muted-foreground md:table-cell">{entry.subSpec}</td>
                {view === "overview" ? (
                  RATING_METRICS.map((m) => {
                    const score = scores[m]
                    return (
                      <td
                        key={m}
                        className={cn("px-2 py-2 text-right font-mono tabular-nums last:pr-4 sm:last:pr-5", sortBy !== m && "text-muted-foreground")}
                        style={sortBy === m && rank === 1 ? { color: METRIC_THEMES[m].accent } : undefined}
                      >
                        {score ? METRIC_THEMES[m].format(score.score) : "—"}
                      </td>
                    )
                  })
                ) : (
                  <>
                    <td className="hidden px-2 py-2 text-xs text-muted-foreground sm:table-cell">{entry.detail}</td>
                    <td className="px-4 py-2 sm:px-5">
                      <div className="flex flex-col items-end gap-1">
                        <span className="font-mono tabular-nums" style={rank === 1 ? { color: theme.accent } : undefined}>
                          {theme.format(entry.score)}
                        </span>
                        <span className="h-0.5 w-24 overflow-hidden rounded-full bg-white/5">
                          <span className="block h-full rounded-full bg-[color:var(--metric)] opacity-60" style={{ width: `${(entry.score / top) * 100}%` }} />
                        </span>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={view === "overview" ? 7 : 6} className="px-5 py-10 text-center text-muted-foreground">No characters match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
        <span>
          {filtered.length === 0 ? "0" : `${current * PAGE_SIZE + 1}–${Math.min((current + 1) * PAGE_SIZE, filtered.length)}`} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          <PageButton disabled={current === 0} onClick={() => setPage(current - 1)} label="Previous page">
            <ChevronLeft className="size-4" />
          </PageButton>
          <span className="px-2 tabular-nums">
            {current + 1} / {pages}
          </span>
          <PageButton disabled={current >= pages - 1} onClick={() => setPage(current + 1)} label="Next page">
            <ChevronRight className="size-4" />
          </PageButton>
        </div>
      </div>
    </section>
  )
}

function FilterChip({ active, onClick, label, children }: { active: boolean; onClick: () => void; label?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-7 items-center rounded-md border px-2 text-xs transition-colors",
        active ? "border-[color:var(--metric)] bg-white/5 text-foreground" : "border-transparent text-muted-foreground hover:bg-white/5 hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function PageButton({ disabled, onClick, label, children }: { disabled: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex size-7 items-center justify-center rounded-md border transition-colors hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  )
}
