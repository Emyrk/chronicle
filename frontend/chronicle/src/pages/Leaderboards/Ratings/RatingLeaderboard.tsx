import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { ArrowDown, ChevronDown, ChevronRight, RotateCcw, ZoomIn } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import {
  CLASS_ORDER,
  MOLTEN_CORE_BOSSES,
  RATING_METRICS,
  childScopes,
  scopeBoard,
  scopeEntries,
  scopeKind,
  type RatingBoardData,
  type RatingEntry,
  type RatingMetric,
  type RatingPeriod,
  type RatingScope,
  type ScopeKind,
} from "./ratingBoards.fixtures"
import { RatingFullList } from "./RatingFullList"
import { BossPortrait, Emblem, EntryRow, ScopeMark, SpecIcon } from "./RatingParts"
import { METRIC_THEMES, VIEW_ORDER, scopeTitle, type MetricTheme, type RatingView } from "./ratingThemes"

const KIND_LABEL: Record<ScopeKind, string> = { raid: "Raid", boss: "Boss", class: "Class", spec: "Spec" }

export interface RatingLeaderboardProps {
  instanceName?: string
  initialView?: RatingView
  initialScope?: RatingScope
  initialPeriod?: RatingPeriod
}

/**
 * One leaderboard design shared by Peak, Ranked Mastery, and Renown, plus an
 * Overview that shows all three side by side.
 *
 * Navigation is one scope (boss, class, spec) shown in the picker bar. Each
 * scope puts its own board in the center, the next level's boards around it,
 * and the complete ranked table underneath. Clicking a board narrows the
 * pickers to that board; the pickers widen it again.
 */
export function RatingLeaderboard({
  instanceName = "Molten Core",
  initialView = "overview",
  initialScope = {},
  initialPeriod = "180d",
}: RatingLeaderboardProps) {
  const [view, setView] = useState<RatingView>(initialView)
  const [period, setPeriod] = useState<RatingPeriod>(initialPeriod)
  const [scope, setScope] = useState<RatingScope>(initialScope)
  const tableRef = useRef<HTMLDivElement>(null)
  const theme = METRIC_THEMES[view]
  const kind = scopeKind(scope)
  const title = scopeTitle(scope, instanceName)
  const go = setScope
  const showTable = () => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })

  const boards = useMemo(
    () =>
      RATING_METRICS.map((m) => ({
        metric: m,
        center: scopeBoard(m, period, scope, 8),
        around: childScopes(scope)
          .map((child) => scopeBoard(m, period, child, 5))
          .filter((b) => b.total > 0),
      })),
    [scope, period],
  )
  const single = view === "overview" ? undefined : boards.find((b) => b.metric === view)!
  const specs = scope.cls
    ? childScopes({ cls: scope.cls })
        .filter((c) => scopeEntries("peak", period, c).length > 0)
        .map((c) => c.spec!)
    : []

  return (
    <div className="min-h-screen w-full bg-background text-foreground" style={{ "--metric": theme.accent } as CSSProperties} data-metric={view}>
      <div className="mx-auto w-full max-w-[1600px] space-y-5 px-3 py-4 sm:px-4 sm:py-8">
        <header className="relative overflow-hidden rounded-xl border bg-card">
          <img src={getInstanceBackground(instanceName)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
          <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/30" />
          <div className="absolute inset-x-0 top-0 h-0.5 bg-[color:var(--metric)]" />
          <div className="relative flex flex-wrap items-end justify-between gap-4 px-4 pt-6 pb-4 sm:px-6 sm:pt-10">
            <div className="flex min-w-0 items-end gap-4">
              {kind !== "raid" && <HeaderMark scope={scope} />}
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                  {instanceName}
                  <span className="ml-1.5 text-[color:var(--metric)]">· {theme.label}</span>
                </p>
                <h1 className="mt-1 font-wow text-2xl sm:text-3xl" style={kind === "class" || kind === "spec" ? { color: CLASS_CSS_VAR[scope.cls!] } : undefined}>
                  {title}
                </h1>
              </div>
            </div>
            <PeriodToggle value={period} onChange={setPeriod} />
          </div>
          <nav className="relative flex overflow-x-auto border-t border-white/5 px-2 sm:px-4" aria-label="Rating metric">
            {VIEW_ORDER.map((m) => {
              const t = METRIC_THEMES[m]
              const active = m === view
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(m)}
                  style={active ? { borderColor: t.accent } : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
                    active ? "text-foreground" : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                  )}
                >
                  <t.icon className="size-4" style={active ? { color: t.accent } : undefined} />
                  {t.label}
                </button>
              )
            })}
          </nav>
          <ScopeBar scope={scope} specs={specs} onChange={go} />
        </header>

        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          <theme.icon className="size-4 shrink-0 text-[color:var(--metric)]" />
          {theme.tagline}
        </p>

        {kind !== "spec" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-flow-dense lg:grid-cols-4">
            {single ? (
              <CenterBoard board={single.center} theme={theme} title={title} onShowAll={showTable} />
            ) : (
              <OverviewCenter
                boards={boards.map((b) => ({ metric: b.metric, board: b.center }))}
                theme={theme}
                title={title}
                onSelect={setView}
                onShowAll={showTable}
              />
            )}
            {(single ?? boards[0]).around.map((board) => (
              <SideFrame key={board.id} board={board} label={theme.label} instanceName={instanceName} onOpen={() => go(board.scope)}>
                {single
                  ? board.entries.map((entry, i) => <EntryRow key={entry.id} entry={entry} rank={i + 1} theme={theme} size="sm" />)
                  : boards.map((b) => (
                      <OverviewRow key={b.metric} metric={b.metric} entry={b.around.find((x) => x.id === board.id)?.entries[0]} />
                    ))}
              </SideFrame>
            ))}
          </div>
        )}

        <div ref={tableRef} className="scroll-mt-4">
          <RatingFullList key={`${JSON.stringify(scope)}-${view}-${period}`} scope={scope} title={title} period={period} view={view} />
        </div>

        <p className="px-1 text-xs text-muted-foreground/70">
          Mock data for design review. Names and scores are generated and do not represent real characters.
        </p>
      </div>
    </div>
  )
}

/** Boss, class, and spec pickers: where you are, and the way to go anywhere else. */
function ScopeBar({ scope, specs, onChange }: { scope: RatingScope; specs: string[]; onChange: (scope: RatingScope) => void }) {
  const ALL = "all"
  return (
    <div className="relative flex flex-wrap items-center gap-2 border-t border-white/5 bg-black/20 px-3 py-2.5 sm:px-5" role="group" aria-label="Leaderboard scope">
      <Picker
        label="Boss"
        value={scope.boss ?? ALL}
        options={[{ value: ALL, label: "All bosses" }, ...MOLTEN_CORE_BOSSES.map((b) => ({ value: b, label: b, icon: <BossPortrait boss={b} size="sm" /> }))]}
        onChange={(v) => onChange({ ...scope, boss: v === ALL ? undefined : v })}
      />
      <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />
      <Picker
        label="Class"
        value={scope.cls ?? ALL}
        options={[
          { value: ALL, label: "All classes" },
          ...CLASS_ORDER.map((c) => ({ value: c, label: CLASS_DISPLAY[c], icon: <ClassIcon cls={c} className="size-5 rounded-sm" />, color: CLASS_CSS_VAR[c] })),
        ]}
        onChange={(v) => onChange({ boss: scope.boss, cls: v === ALL ? undefined : v })}
      />
      <ChevronRight className="size-3.5 text-muted-foreground/50" aria-hidden />
      <Picker
        label="Spec"
        value={scope.spec ?? ALL}
        disabled={!scope.cls}
        placeholder="Pick a class first"
        options={[
          { value: ALL, label: "All specs" },
          ...specs.map((sp) => ({ value: sp, label: sp, icon: <SpecIcon cls={scope.cls!} spec={sp} className="size-5 rounded-sm" /> })),
        ]}
        onChange={(v) => onChange({ ...scope, spec: v === ALL ? undefined : v })}
      />
      {scopeKind(scope) !== "raid" && (
        <button
          type="button"
          onClick={() => onChange({})}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
        >
          <RotateCcw className="size-3.5" />
          Whole raid
        </button>
      )}
    </div>
  )
}

interface PickerOption {
  value: string
  label: string
  icon?: ReactNode
  color?: string
}

function Picker({
  label,
  value,
  options,
  onChange,
  disabled,
  placeholder,
}: {
  label: string
  value: string
  options: PickerOption[]
  onChange: (value: string) => void
  disabled?: boolean
  placeholder?: string
}) {
  const current = options.find((o) => o.value === value) ?? options[0]
  const narrowed = current !== options[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`${label}: ${disabled && placeholder ? placeholder : current.label}`}
        className={cn(
          "flex h-9 min-w-36 items-center gap-2 rounded-md border bg-background/60 pr-2 pl-2.5 text-left text-sm transition-colors outline-none hover:bg-white/5 focus-visible:border-ring disabled:pointer-events-none disabled:opacity-50",
          narrowed && "border-[color:var(--metric)]/60",
        )}
      >
        {current.icon}
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[10px] tracking-wider text-muted-foreground uppercase">{label}</span>
          <span className={cn("truncate", !narrowed && "text-muted-foreground")} style={{ color: narrowed ? current.color : undefined }}>
            {disabled && placeholder ? placeholder : current.label}
          </span>
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="styled-scrollbar min-w-48">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="gap-2">
              {o.icon}
              <span style={{ color: o.color }}>{o.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Banner art for the current scope. Boss pages lead with the boss face. */
function HeaderMark({ scope }: { scope: RatingScope }) {
  return (
    <div className="flex shrink-0 items-end gap-2">
      {scope.boss && <BossPortrait boss={scope.boss} size="lg" />}
      {scope.cls && (
        <span className="mb-0.5 flex size-10 items-center justify-center rounded-md border border-white/10 bg-black/30">
          {scope.spec ? <SpecIcon cls={scope.cls} spec={scope.spec} className="size-7 rounded-sm" /> : <ScopeMark scope={{ cls: scope.cls }} size="sm" />}
        </span>
      )}
    </div>
  )
}

function PeriodToggle({ value, onChange }: { value: RatingPeriod; onChange: (v: RatingPeriod) => void }) {
  const options: { id: RatingPeriod; label: string }[] = [
    { id: "180d", label: "180 days" },
    { id: "all", label: "All time" },
  ]
  return (
    <div className="flex rounded-md border bg-background/70 p-0.5 text-xs backdrop-blur-sm" role="group" aria-label="Period">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded px-3 py-1.5 font-medium transition-colors",
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
  children,
}: {
  board: RatingBoardData
  theme: MetricTheme
  title: string
  onShowAll: () => void
  children: ReactNode
}) {
  return (
    <section
      aria-label={`${title} ${theme.label} leaderboard`}
      className="relative flex flex-col overflow-hidden rounded-xl border bg-card sm:col-span-2 lg:col-start-2 lg:row-span-2 lg:row-start-1"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{ background: "radial-gradient(ellipse 60% 70% at 50% 0%, color-mix(in oklab, var(--metric) 14%, transparent), transparent 70%)" }}
      />
      <div className="relative flex flex-col items-center px-4 pt-6 pb-4 text-center">
        <Emblem size="lg" accent>
          {board.kind === "raid" ? <theme.icon className="size-7 text-[color:var(--metric)]" /> : <ScopeMark scope={board.scope} size="lg" />}
        </Emblem>
        <span className="mt-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {KIND_LABEL[board.kind]} · {theme.label}
        </span>
        <h2 className="mt-0.5 font-wow text-xl sm:text-2xl">{title}</h2>
        <span className="text-xs text-muted-foreground">{board.subtitle}</span>
      </div>
      {children}
      <button
        type="button"
        onClick={onShowAll}
        className="relative mt-auto flex items-center justify-center gap-1.5 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-white/[.03] hover:text-foreground"
      >
        <ArrowDown className="size-3.5" />
        All {board.total} ranked
      </button>
    </section>
  )
}

function CenterBoard({ board, theme, title, onShowAll }: { board: RatingBoardData; theme: MetricTheme; title: string; onShowAll: () => void }) {
  return (
    <CenterFrame board={board} theme={theme} title={title} onShowAll={onShowAll}>
      <ol className="relative border-t">
        {board.entries.slice(0, 3).map((entry, i) => (
          <EntryRow key={entry.id} entry={entry} rank={i + 1} theme={theme} size="lg" />
        ))}
      </ol>
      <ol className="relative border-t bg-black/10">
        {board.entries.slice(3).map((entry, i) => (
          <EntryRow key={entry.id} entry={entry} rank={i + 4} theme={theme} size="sm" />
        ))}
      </ol>
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
}: {
  boards: { metric: RatingMetric; board: RatingBoardData }[]
  theme: MetricTheme
  title: string
  onSelect: (metric: RatingMetric) => void
  onShowAll: () => void
}) {
  return (
    <CenterFrame board={boards[0].board} theme={theme} title={title} onShowAll={onShowAll}>
      <div className="relative grid border-t max-lg:divide-y lg:grid-cols-3 lg:divide-x">
        {boards.map(({ metric, board }) => {
          const t = METRIC_THEMES[metric]
          return (
            <div key={metric} className="flex min-w-0 flex-col">
              <button
                type="button"
                onClick={() => onSelect(metric)}
                className="group/col flex items-center gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-white/[.03]"
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

/** One metric's leader inside an Overview side board. */
function OverviewRow({ metric, entry }: { metric: RatingMetric; entry?: RatingEntry }) {
  const t = METRIC_THEMES[metric]
  return (
    <li className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0">
      <span className="flex size-6 shrink-0 items-center justify-center" title={t.label}>
        <t.icon className="size-4" style={{ color: t.accent }} aria-label={t.label} />
      </span>
      {entry ? (
        <>
          <SpecIcon cls={entry.cls} spec={entry.spec} className="size-5 shrink-0 rounded-sm" />
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-baseline gap-1.5">
              <span className="max-w-full shrink-0 truncate text-sm font-medium" style={{ color: CLASS_CSS_VAR[entry.cls] }}>
                {entry.name}
              </span>
              {entry.guild && <span className="min-w-0 truncate text-xs text-muted-foreground">&lt;{entry.guild}&gt;</span>}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {entry.spec} · {entry.detail}
            </span>
          </span>
          <span className="shrink-0 text-right font-mono text-sm tabular-nums" style={{ color: t.accent }}>
            {t.format(entry.score)}
          </span>
        </>
      ) : (
        <span className="text-xs text-muted-foreground">No ranked kills</span>
      )}
    </li>
  )
}

/** A board one level down. The whole header narrows the pickers to it. */
function SideFrame({
  board,
  label,
  instanceName,
  onOpen,
  children,
}: {
  board: RatingBoardData
  label: string
  instanceName: string
  onOpen: () => void
  children: ReactNode
}) {
  const title = board.kind === "spec" ? board.scope.spec! : scopeTitle(board.scope, instanceName)
  const color = board.kind === "class" || board.kind === "spec" ? CLASS_CSS_VAR[board.scope.cls!] : undefined
  return (
    <section aria-label={`${title} ${label} leaderboard`} className="flex flex-col overflow-hidden rounded-xl border bg-card/60 transition-colors hover:border-white/15">
      <button
        type="button"
        onClick={onOpen}
        title={`Show ${title}`}
        className="group/open flex min-w-0 items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-white/[.03]"
      >
        <Emblem size="sm">
          <ScopeMark scope={board.scope} size="sm" />
        </Emblem>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold tracking-wide uppercase" style={{ color }}>
            {title}
          </span>
          <span className="block text-[11px] text-muted-foreground">{board.subtitle}</span>
        </span>
        <ZoomIn aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground/60 transition-colors group-hover/open:text-[color:var(--metric)]" />
      </button>
      <ol className="border-t">{children}</ol>
    </section>
  )
}
