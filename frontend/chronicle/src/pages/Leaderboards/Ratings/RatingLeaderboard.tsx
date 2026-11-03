import { useMemo, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowDown, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import {
  RATING_METRICS,
  childScopes,
  scopeBoard,
  type RatingEntry,
  type RatingMetric,
  type RatingPeriod,
  type RatingScope,
} from "./ratingBoards.fixtures"
import { BoardSearch, RatingFullList } from "./RatingFullList"
import type { RatingLiveBoard, RatingLiveData, RatingLiveState } from "./ratingLiveData"
import { Emblem, EntryRow, ScopeMark, SpecIcon } from "./RatingParts"
import { METRIC_THEMES, VIEW_ORDER, scopeTitle, type MetricTheme, type RatingView } from "./ratingThemes"

/** What the cards under the board split by. */
type ChildKind = "boss" | "class" | "spec"

/**
 * The boards for one scope and view: center board, the next level's boards
 * around it, and the full ranked table underneath. The leaderboard hub's
 * Ratings tab renders this.
 */
export function RatingBoards({
  instanceName,
  scope,
  onScope,
  view,
  onView,
  period,
  bosses,
  title: titleOverride,
  toolbar,
  live,
}: {
  instanceName: string
  scope: RatingScope
  onScope: (scope: RatingScope) => void
  view: RatingView
  onView: (view: RatingView) => void
  period: RatingPeriod
  /** A combined boss set: only these bosses get side boards. */
  bosses?: readonly string[]
  title?: string
  /** Metric switch and period, shown in the board's (or table's) header. */
  toolbar?: ReactNode
  live?: RatingLiveData
}) {
  const theme = METRIC_THEMES[view]
  const title = titleOverride ?? scopeTitle(scope, instanceName)
  // "All N ranked" swaps the boards for the full table in place. It stays open across metrics and
  // periods; a new boss or filter shows the boards again.
  const boardKey = JSON.stringify(scope)
  const [expandedKey, setExpandedKey] = useState<string>()
  // Search lives in the board header; typing opens the table already filtered.
  const [search, setSearch] = useState({ key: "", text: "" })
  const query = search.key === boardKey ? search.text : ""
  const setQuery = (text: string) => setSearch({ key: boardKey, text })
  const expanded = expandedKey === boardKey || query.trim() !== ""
  const showTable = () => setExpandedKey(boardKey)
  const collapse = () => {
    setExpandedKey(undefined)
    setQuery("")
  }
  const searchBox = <BoardSearch query={query} onQuery={setQuery} />

  // Full clear: the board, then a card per boss (filtered by any class or spec). One boss: its full
  // table straight away; the encounter list already moves between bosses.
  const childBy: ChildKind = "boss"
  const tableOnly = !!scope.boss
  const boards = useMemo(
    () =>
      RATING_METRICS.map((m) => {
        const children = (scope.boss ? [] : live ? (bosses ?? []).map((boss) => ({ ...scope, boss })) : childScopes({}).map((c) => ({ ...scope, boss: c.boss })))
          .filter((child) => !bosses || !child.boss || bosses.includes(child.boss))
        const getBoard = (target: RatingScope): RatingLiveState<RatingLiveBoard> => live
          ? live.board({ scope: target, metric: m, period, cohort: live.cohort })
          : { status: "ready", data: scopeBoard(m, period, target, target.boss ? 3 : 10) }
        return {
          metric: m,
          center: getBoard(scope),
          around: children.map(getBoard).filter((state): state is { status: "ready"; data: RatingLiveBoard } => state.status === "ready")
            .map((state) => state.data).filter((board) => (board.total ?? board.entries.length) > 0),
        }
      }),
    [scope, period, bosses, live],
  )
  const single = view === "overview" ? undefined : boards.find((b) => b.metric === view)!
  const pending = (single ? [single] : boards).find((b) => b.center.status !== "ready")?.center
  const readyBoards = boards.filter((b): b is { metric: RatingMetric; center: { status: "ready"; data: RatingLiveBoard }; around: RatingLiveBoard[] } => b.center.status === "ready")

  return (
    <div className="space-y-5" style={{ "--metric": theme.accent } as CSSProperties} data-metric={view}>
      {/* Metric taglines (METRIC_THEMES[*].tagline) are hidden for now to save vertical space; they come back later. */}
      {/* The top: the board, or (opened, searched, or a spec, which has no smaller boards) the full table. */}
      {tableOnly || expanded ? (
        <RatingFullList
          key={`${boardKey}|${view}|${period}`}
          scope={scope}
          title={title}
          period={period}
          view={view}
          query={query}
          onQuery={setQuery}
          onCollapse={tableOnly ? undefined : collapse}
          toolbar={toolbar}
          live={live}
        />
      ) : pending ? (
        <section role={pending.status === "error" ? "alert" : "status"} className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
          {pending.status === "error" ? pending.error : "Loading published ratings…"}
        </section>
      ) : single && single.center.status === "ready" ? (
        <CenterBoard board={single.center.data} theme={theme} title={title} onShowAll={showTable} search={searchBox} toolbar={toolbar} />
      ) : (
        <OverviewCenter
          boards={readyBoards.map((b) => ({ metric: b.metric, board: b.center.data }))}
          theme={theme}
          title={title}
          onSelect={onView}
          onShowAll={showTable}
          search={searchBox}
          toolbar={toolbar}
        />
      )}

      {!tableOnly && (
        <>
          {/* One compact card per boss (or class, or spec), the same size as the guild boards' cards. */}
          <section aria-label={`By ${childBy}`} className="space-y-3">
            <h2 className="px-1 text-sm font-semibold">By {childBy}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {(single ?? boards[0]).around.map((board) => (
                <SideFrame key={board.id} board={board} by={childBy} label={theme.label} onOpen={() => onScope(board.scope)}>
                  {single
                    ? board.entries.map((entry, i) => (
                        <CompactRow
                          key={entry.id}
                          entry={entry}
                          theme={theme}
                          lead={<span className="w-3.5 font-mono text-[10px] text-muted-foreground">{i + 1}</span>}
                        />
                      ))
                    : boards.map((b) => {
                        const t = METRIC_THEMES[b.metric]
                        const entry = b.around.find((x) => x.id === board.id)?.entries[0]
                        return entry ? (
                          <CompactRow
                            key={b.metric}
                            entry={entry}
                            theme={t}
                            lead={<t.icon className="size-3.5 shrink-0" style={{ color: t.accent }} aria-label={t.label} />}
                          />
                        ) : (
                          <li key={b.metric} className="px-3 py-1.5 text-xs text-muted-foreground">
                            No ranked kills
                          </li>
                        )
                      })}
                </SideFrame>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

/**
 * Overview / Peak / Ranked Mastery / Renown, as a compact segmented switch that lives in the board's
 * header: a setting of the board, not another row of page tabs. The chosen one takes its metric color.
 */
export function MetricTabs({ view, onView, className }: { view: RatingView; onView: (view: RatingView) => void; className?: string }) {
  return (
    <nav className={cn("relative flex rounded-md border bg-background/60 p-0.5", className)} aria-label="Rating metric">
      {VIEW_ORDER.map((m) => {
        const t = METRIC_THEMES[m]
        const active = m === view
        return (
          <button
            key={m}
            type="button"
            aria-pressed={active}
            onClick={() => onView(m)}
            style={
              active
                ? {
                    color: t.accent,
                    backgroundColor: `color-mix(in srgb, ${t.accent} 14%, transparent)`,
                    boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${t.accent} 40%, transparent)`,
                  }
                : undefined
            }
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
              !active && "text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-3.5" />
            {t.label}
          </button>
        )
      })}
    </nav>
  )
}

export function PeriodToggle({ value, onChange }: { value: RatingPeriod; onChange: (v: RatingPeriod) => void }) {
  const options: { id: RatingPeriod; label: string }[] = [
    { id: "180d", label: "180 days" },
    { id: "all", label: "All time" },
  ]
  return (
    <div className="flex rounded-md border bg-background/60 p-0.5 text-xs" role="group" aria-label="Period">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "cursor-pointer rounded px-2.5 py-1.5 font-medium transition-colors",
            value === o.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function CenterFrame({
  board,
  theme,
  title,
  onShowAll,
  search,
  toolbar,
  children,
}: {
  board: RatingLiveBoard
  theme: MetricTheme
  title: string
  onShowAll: () => void
  search: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-label={`${title} ${theme.label} leaderboard`} className="relative flex flex-col overflow-hidden rounded-xl border bg-card">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40"
        style={{ background: "radial-gradient(ellipse 50% 100% at 0% 0%, color-mix(in oklab, var(--metric) 14%, transparent), transparent 70%)" }}
      />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Emblem size="sm" accent>
            {board.kind === "raid" ? <theme.icon className="size-5 text-[color:var(--metric)]" /> : <ScopeMark scope={board.scope} size="sm" />}
          </Emblem>
          <div className="min-w-0">
            <h2 className="truncate font-wow text-xl leading-tight">{title}</h2>
            <span className="block truncate text-xs text-muted-foreground">{board.subtitle}</span>
          </div>
        </div>
        {toolbar}
        <div className="ml-auto">{search}</div>
      </div>
      {children}
      <button
        type="button"
        onClick={onShowAll}
        className="cursor-pointer relative mt-auto flex items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[.03] hover:text-foreground"
      >
        <ArrowDown className="size-3.5" />
        All {board.total === undefined ? "" : `${board.total} `}ranked
      </button>
    </section>
  )
}

function CenterBoard({
  board,
  theme,
  title,
  onShowAll,
  search,
  toolbar,
}: {
  board: RatingLiveBoard
  theme: MetricTheme
  title: string
  onShowAll: () => void
  search: ReactNode
  toolbar?: ReactNode
}) {
  return (
    <CenterFrame board={board} theme={theme} title={title} onShowAll={onShowAll} search={search} toolbar={toolbar}>
      {/* Top ten in two columns: 1–5 and 6–10, so the full-width board stays short. */}
      <div className="relative grid border-t max-lg:divide-y lg:grid-cols-2 lg:divide-x">
        <ol>
          {board.entries.slice(0, 5).map((entry, i) => (
            <EntryRow key={entry.id} entry={entry} rank={i + 1} theme={theme} size="sm" />
          ))}
        </ol>
        <ol>
          {board.entries.slice(5, 10).map((entry, i) => (
            <EntryRow key={entry.id} entry={entry} rank={i + 6} theme={theme} size="sm" />
          ))}
        </ol>
      </div>
    </CenterFrame>
  )
}

/** Overview center: the top of each metric board, side by side. */
function OverviewCenter({
  boards,
  theme,
  title,
  onSelect,
  onShowAll,
  search,
  toolbar,
}: {
  boards: { metric: RatingMetric; board: RatingLiveBoard }[]
  theme: MetricTheme
  title: string
  onSelect: (metric: RatingMetric) => void
  onShowAll: () => void
  search: ReactNode
  toolbar?: ReactNode
}) {
  return (
    <CenterFrame board={boards[0].board} theme={theme} title={title} onShowAll={onShowAll} search={search} toolbar={toolbar}>
      <div className="relative grid border-t max-lg:divide-y lg:grid-cols-3 lg:divide-x">
        {boards.map(({ metric, board }) => {
          const t = METRIC_THEMES[metric]
          return (
            <div key={metric} className="flex min-w-0 flex-col">
              <button
                type="button"
                onClick={() => onSelect(metric)}
                className="cursor-pointer group/col flex items-center gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-white/[.03]"
                style={{ boxShadow: `inset 0 2px 0 ${t.accent}` }}
              >
                <t.icon className="size-4 shrink-0" style={{ color: t.accent }} />
                <span className="text-xs font-semibold tracking-wide uppercase">{t.label}</span>
                <ChevronRight className="ml-auto size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover/col:opacity-100" />
              </button>
              <ol>
                {board.entries.slice(0, 5).map((entry, i) => (
                  <EntryRow key={entry.id} entry={entry} rank={i + 1} theme={t} size="sm" />
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </CenterFrame>
  )
}

/** One line per entry in a compact card: rank or metric icon, spec icon, name, score. Detail on hover. */
function CompactRow({ entry, theme, lead }: { entry: RatingEntry; theme: MetricTheme; lead: ReactNode }) {
  return (
    <li
      className="flex items-center gap-2 px-3 py-1.5"
      title={`${entry.name}${entry.guild ? ` <${entry.guild}>` : ""} · ${entry.spec} · ${entry.detail}`}
    >
      {lead}
      <SpecIcon cls={entry.cls} spec={entry.spec} className="size-4 shrink-0 rounded-sm" />
      <span className="min-w-0 flex-1 truncate" style={{ color: CLASS_CSS_VAR[entry.cls] }}>
        {entry.name}
      </span>
      <span className="shrink-0 font-mono tabular-nums">{theme.format(entry.score)}</span>
    </li>
  )
}

/** A board one level down. The whole header narrows the pickers to it. */
function SideFrame({
  board,
  by,
  label,
  onOpen,
  children,
}: {
  board: RatingLiveBoard
  /** What this card stands for: a boss card under a class or spec filter is still a boss card. */
  by: ChildKind
  label: string
  onOpen: () => void
  children: ReactNode
}) {
  const s = board.scope
  const title = by === "boss" ? s.boss! : by === "class" ? (CLASS_DISPLAY[s.cls!] ?? s.cls!) : s.spec!
  const color = by === "boss" ? undefined : CLASS_CSS_VAR[s.cls!]
  return (
    <section
      aria-label={`${title} ${label} leaderboard`}
      className="flex flex-col overflow-hidden rounded-xl border bg-card/60 transition-colors hover:border-white/15"
    >
      <button
        type="button"
        onClick={onOpen}
        title={`Show ${title}`}
        className="group/open flex min-w-0 cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-white/[.03]"
      >
        <ScopeMark scope={by === "boss" ? { boss: s.boss } : by === "class" ? { cls: s.cls } : { cls: s.cls, spec: s.spec }} size="sm" />
        <span className="truncate font-wow text-base group-hover/open:text-[color:var(--metric)]" style={{ color }}>
          {title}
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{board.total} ranked</span>
      </button>
      <ol className="border-t py-0.5 text-xs">{children}</ol>
    </section>
  )
}
