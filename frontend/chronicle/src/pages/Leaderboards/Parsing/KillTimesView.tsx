import { useMemo } from "react"
import { useTimeParseCohort } from "@/api/rankingsQueries"
import type { TimeParseSpread } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { parseHexColor } from "@/pages/Instance/parseColors"
import { CohortSummaryStrip } from "@/pages/Parsing/cohort/CohortChrome"
import { CohortDistribution } from "@/pages/Parsing/cohort/CohortDistribution"
import { formatClock, summarizeCohort, tierCutoffs } from "@/pages/Parsing/cohort/cohortStats"
import { timeBands, timeCutoff, type SpreadDifficultyOption } from "./spreadBands"

const COLUMN_FLOORS = [50, 75, 95, 99] as const
const FULL_CLEAR = "Full clear"

/**
 * Kill-time parses for a whole instance: one row per boss (plus the full
 * clear) showing the time each parse tier takes, and the selected row's
 * full kill-time histogram below.
 */
export function KillTimesView({
  instanceName,
  bosses,
  boss,
  showClear,
  spreads,
  difficulty,
  loading,
  onSelectBoss,
  onSelectClear,
}: {
  instanceName: string
  bosses: readonly string[]
  boss: string
  /** The full clear is selected instead of a boss. */
  showClear: boolean
  /** Spreads for the selected difficulty. */
  spreads: readonly TimeParseSpread[]
  difficulty: SpreadDifficultyOption | undefined
  loading: boolean
  onSelectBoss: (boss: string) => void
  onSelectClear: () => void
}) {
  const clear = spreads.find((s) => s.kind === "clear_time")
  const byBoss = useMemo(
    () => new Map(spreads.filter((s) => s.kind === "boss_kill").map((s) => [s.encounter_name ?? "", s])),
    [spreads],
  )
  const rows: { name: string; spread: TimeParseSpread | undefined; selected: boolean; onClick: () => void }[] = [
    ...(clear ? [{ name: FULL_CLEAR, spread: clear, selected: showClear, onClick: onSelectClear }] : []),
    ...bosses.map((name) => ({
      name,
      spread: byBoss.get(name),
      selected: !showClear && name === boss,
      onClick: () => onSelectBoss(name),
    })),
  ]
  const selectedClear = showClear && !!clear

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const cohortQuery = useTimeParseCohort({
    date: today,
    period: "60d",
    kind: selectedClear ? "clear_time" : "boss_kill",
    instanceName,
    encounterName: selectedClear ? "" : boss,
    difficulty: difficulty?.difficultyName ?? "",
    maxPlayers: selectedClear || byBoss.has(boss) ? difficulty?.maxPlayers : undefined,
  })
  const entries = useMemo(() => cohortQuery.data?.entries ?? [], [cohortQuery.data])
  const scored = useMemo(() => entries.map((e) => ({ value: e.duration_ms, score: e.display_score })), [entries])
  const summary = useMemo(() => summarizeCohort(entries.map((e) => e.duration_ms), "lower"), [entries])
  const cutoffs = useMemo(() => tierCutoffs(scored, "lower"), [scored])
  const selectedName = selectedClear ? FULL_CLEAR : boss

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-card p-3 sm:p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">Kill time needed for each parse</h2>
          <span className="text-xs text-muted-foreground/70">Each row on its own scale · faster on the left</span>
        </div>
        {loading && spreads.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : spreads.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No timed kills in the last 60 days.</p>
        ) : (
          <div className="space-y-0.5">
            <div className="flex items-center gap-3 px-1 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
              <div className="w-28 shrink-0 sm:w-44">Encounter</div>
              <div className="flex-1" />
              {COLUMN_FLOORS.map((floor) => (
                <div key={floor} className="hidden w-16 shrink-0 items-center justify-end gap-1 md:flex">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: parseHexColor(floor) }} />
                  {floor}+
                </div>
              ))}
              <div className="w-16 shrink-0 text-right md:hidden">95+</div>
              <div className="hidden w-12 shrink-0 text-right sm:block">Kills</div>
            </div>
            {rows.map((row) => (
              <KillTimeRow key={row.name} {...row} isClear={row.name === FULL_CLEAR} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-3 sm:p-5">
        <h2 className="text-sm font-medium text-muted-foreground">
          <span className="text-foreground">{selectedName}</span> {selectedClear ? "times" : "kill times"}
        </h2>
        {!selectedClear && !byBoss.has(boss) ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : `No timed ${boss} kills in the last 60 days.`}
          </p>
        ) : cohortQuery.isError ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Couldn't load these kill times.</p>
        ) : !summary ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className={cn("space-y-3 transition-opacity", cohortQuery.isPlaceholderData && "opacity-60")}>
            <CohortSummaryStrip
              summary={summary}
              cutoffs={cutoffs}
              formatValue={formatClock}
              sampleLabel={selectedClear ? "Clears" : "Kills"}
              bestLabel="Fastest"
              worstLabel="Slowest"
              status={cohortQuery.data?.status}
            />
            <CohortDistribution
              values={scored}
              time
              direction="lower"
              formatValue={formatClock}
              unitLabel={selectedClear ? "clears" : "kills"}
            />
          </div>
        )}
      </section>
    </div>
  )
}

function KillTimeRow({
  name,
  spread,
  selected,
  isClear,
  onClick,
}: {
  name: string
  spread: TimeParseSpread | undefined
  selected: boolean
  isClear: boolean
  onClick: () => void
}) {
  const scored = !!spread && spread.status !== "sample_too_small"
  // Clip the slow tail so one long kill doesn't flatten the row.
  const slowest25 = spread ? timeCutoff(spread, 25) : null
  const domainStart = spread?.min_ms ?? 0
  const domainEnd = spread
    ? Math.max(domainStart + 1, slowest25 !== null ? Math.min(spread.max_ms, slowest25 + (slowest25 - domainStart) * 0.5) : spread.max_ms)
    : 1
  const pct = (v: number) => `${((Math.min(domainEnd, Math.max(domainStart, v)) - domainStart) / (domainEnd - domainStart)) * 100}%`
  const bands = spread ? timeBands(spread) : []
  const value = (floor: number) => {
    const cutoff = spread ? timeCutoff(spread, floor) : null
    return cutoff === null ? "—" : formatClock(cutoff)
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        selected && "bg-primary/10",
        isClear && "mb-1 border-b border-border/60 pb-2",
      )}
    >
      <span className={cn("w-28 shrink-0 truncate text-xs sm:w-44", isClear ? "font-semibold" : "font-medium", !spread && "text-muted-foreground")}>
        {name}
      </span>
      <span className={cn("relative h-5 flex-1", !scored && "opacity-40")}>
        {bands.map((band) => {
          // The fastest outliers (100) and slow tail (0-24) are whiskers.
          const whisker = scored && (band.floor === 0 || band.floor === 100)
          return (
            <span
              key={band.floor}
              className={cn("absolute", whisker ? "top-1/2 h-0.5 -translate-y-1/2" : "top-0.5 bottom-0.5 border-r-2 border-card")}
              style={{
                left: pct(band.start),
                width: `calc(${pct(band.end)} - ${pct(band.start)})`,
                backgroundColor: parseHexColor(scored ? band.floor : 0),
                opacity: whisker && band.floor === 0 ? 0.5 : undefined,
              }}
            />
          )
        })}
      </span>
      {COLUMN_FLOORS.map((floor) => (
        <span key={floor} className="hidden w-16 shrink-0 text-right font-mono text-xs tabular-nums text-foreground md:block">
          {value(floor)}
        </span>
      ))}
      <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-foreground md:hidden">{value(95)}</span>
      <span className="hidden w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">
        {spread ? spread.sample_size.toLocaleString() : "—"}
      </span>
    </button>
  )
}
