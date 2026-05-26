import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, List, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { useIsMobile } from "@/hooks/useIsMobile"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { cn } from "@/lib/utils"
import type { RankingsKillTimeStats, RankingsSuccessRate } from "@/api/typesGenerated"
import {
  useRankingsEncounters,
  useRankingsStats,
  useRankingsLeaderboard,
  useRankingsKillTimes,
  useRankingsSuccessRates,
} from "@/api/rankingsQueries"
import type { RankedEntry } from "./RankingsTable"
import type { TimePeriod } from "./timePeriod"
import { BoxPlotChart } from "./BoxPlotChart"
import { RankingsTable } from "./RankingsTable"

// ── Types ─────────────────────────────────────────────────────────────────

type MetricTab = "dps" | "killtime" | "success"
type DpsSubTab = "boxplot" | "leaderboard"
const PAGE_SIZE = 50

const VALID_PERIODS = new Set<TimePeriod>(["all", "90d", "30d", "7d"])

interface InstanceViewProps {
  instanceName: string
}

// ── Component ─────────────────────────────────────────────────────────────

export function InstanceView({ instanceName }: InstanceViewProps) {
  const [params, setParams] = useSearchParams()
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // ── API queries ───────────────────────────────────────────────────────
  const { data: encounterSummaries, isLoading: encountersLoading } = useRankingsEncounters(instanceName)
  const encounterNames = useMemo(
    () => (encounterSummaries ?? []).map((e) => e.encounter_name),
    [encounterSummaries],
  )
  // We derive boss vs trash: "Trash" is the only trash encounter name by convention
  const bossNames = useMemo(
    () => new Set(encounterNames.filter((n) => n !== "Trash")),
    [encounterNames],
  )
  const trashNames = useMemo(
    () => new Set<string>(encounterNames.filter((n) => n === "Trash")),
    [encounterNames],
  )

  // ── URL state ────────────────────────────────────────────────────────

  const metric: MetricTab = useMemo(() => {
    const raw = params.get("metric")
    if (raw === "killtime" || raw === "success") return raw
    return "dps"
  }, [params])

  const dpsSubTab: DpsSubTab = params.get("tab") === "leaderboard" ? "leaderboard" : "boxplot"

  const page = useMemo(() => {
    const raw = params.get("page")
    const n = raw ? parseInt(raw, 10) : 1
    return Number.isFinite(n) && n >= 1 ? n : 1
  }, [params])

  const timePeriod: TimePeriod = useMemo(() => {
    const raw = params.get("period")
    return raw && VALID_PERIODS.has(raw as TimePeriod) ? (raw as TimePeriod) : "all"
  }, [params])

  // Difficulty filter — kept in URL state but not yet a backend param
  const selectedDifficulties: Set<string> = useMemo(() => {
    const raw = params.get("diff")
    if (!raw) return new Set<string>()
    return new Set(raw.split(",").filter(Boolean))
  }, [params])

  const selectedEncounters: Set<string> = useMemo(() => {
    const raw = params.get("encounters")
    if (!raw) return new Set(encounterNames)
    return new Set(raw.split(",").filter(Boolean))
  }, [params, encounterNames])

  // ── Setters ──────────────────────────────────────────────────────────

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === "") next.delete(key)
        else next.set(key, value)
        return next
      })
    },
    [setParams],
  )

  const handleBack = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("instance")
      next.delete("metric")
      next.delete("tab")
      next.delete("encounters")
      next.delete("period")
      next.delete("diff")
      next.delete("page")
      return next
    })
  }, [setParams])

  const handleMetricChange = useCallback(
    (m: MetricTab) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (m === "dps") next.delete("metric")
        else next.set("metric", m)
        // Clear DPS sub-tab when switching metrics
        next.delete("tab")
        return next
      })
    },
    [setParams],
  )

  const handleDpsSubTabChange = useCallback(
    (t: DpsSubTab) => setParam("tab", t === "boxplot" ? null : t),
    [setParam],
  )

  const handleTimePeriodChange = useCallback(
    (p: TimePeriod) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (p === "all") next.delete("period")
        else next.set("period", p)
        next.delete("page") // reset to page 1
        return next
      })
    },
    [setParams],
  )

  const handlePageChange = useCallback(
    (newPage: number) => setParam("page", newPage <= 1 ? null : String(newPage)),
    [setParam],
  )

  const handleEncounterClick = useCallback(
    (name: string, ctrlKey: boolean) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const raw = prev.get("encounters")
        const current = raw ? new Set(raw.split(",").filter(Boolean)) : new Set(encounterNames)

        if (ctrlKey) {
          // Toggle individual
          if (current.has(name)) current.delete(name)
          else current.add(name)
        } else {
          // Single-select: if already solo-selected, select all; otherwise select only this one
          if (current.size === 1 && current.has(name)) {
            next.delete("encounters")
            return next
          }
          current.clear()
          current.add(name)
        }

        if (current.size === 0 || current.size === encounterNames.length) {
          next.delete("encounters")
        } else {
          next.set("encounters", [...current].join(","))
        }
        return next
      })
    },
    [setParams, encounterNames],
  )

  const handleQuickSelect = useCallback(
    (mode: "all" | "bosses" | "trash") => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (mode === "all") {
          next.delete("encounters")
        } else {
          const names = mode === "bosses" ? bossNames : trashNames
          next.set("encounters", [...names].join(","))
        }
        return next
      })
    },
    [setParams, bossNames, trashNames],
  )

  // ── API query params ─────────────────────────────────────────────────

  const encounterNamesParam = useMemo(() => {
    if (selectedEncounters.size === 0 || selectedEncounters.size === encounterNames.length) return undefined
    return [...selectedEncounters].join(",")
  }, [selectedEncounters, encounterNames.length])

  const periodParam = timePeriod === "all" ? undefined : timePeriod

  // ── Data hooks ─────────────────────────────────────────────────────

  const { data: boxPlotStats = [] } = useRankingsStats({
    instance_names: instanceName,
    encounter_names: encounterNamesParam,
    period: periodParam,
  })

  const { data: leaderboardData } = useRankingsLeaderboard({
    instance_names: instanceName,
    encounter_names: encounterNamesParam,
    period: periodParam,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  // Derive available difficulties from leaderboard entries
  const availableDifficulties = useMemo(() => {
    const entries = leaderboardData?.entries ?? []
    const seen = new Set<string>()
    for (const e of entries) if (e.difficulty_name) seen.add(e.difficulty_name)
    return [...seen].sort()
  }, [leaderboardData])

  const handleToggleDifficulty = useCallback(
    (diff: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const raw = prev.get("diff")
        const current = raw ? new Set(raw.split(",").filter(Boolean)) : new Set<string>()
        if (current.has(diff)) current.delete(diff)
        else current.add(diff)
        if (current.size === 0 || current.size === availableDifficulties.length) {
          next.delete("diff")
        } else {
          next.set("diff", [...current].join(","))
        }
        return next
      })
    },
    [setParams, availableDifficulties.length],
  )

  const totalCount = leaderboardData?.total_count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const leaderboardEntries: RankedEntry[] = useMemo(() => {
    const entries = leaderboardData?.entries ?? []
    // Client-side difficulty filter (not yet a backend param)
    let filtered = [...entries]
    if (selectedDifficulties.size > 0) {
      filtered = filtered.filter((e) => selectedDifficulties.has(e.difficulty_name))
    }
    const offset = (page - 1) * PAGE_SIZE
    return filtered.map((e, i) => ({ ...e, rank: offset + i + 1 }))
  }, [leaderboardData, selectedDifficulties, page])

  const { data: killTimeStats = [] } = useRankingsKillTimes(instanceName, periodParam)
  const { data: successRates = [] } = useRankingsSuccessRates(instanceName, periodParam)

  // ── Loading state ──────────────────────────────────────────────────

  if (encountersLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const sidebarContent = (
    <>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Encounters
        </h3>
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setSidebarOpen(false)}
            title="Close encounters"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Quick-select buttons */}
      <div className="flex gap-1 mt-1.5">
        <Button variant="outline" size="sm" className="h-5 px-1.5 text-xs" onClick={() => handleQuickSelect("all")} title="Select all encounters">All</Button>
        <Button variant="outline" size="sm" className="h-5 px-1.5 text-xs" onClick={() => handleQuickSelect("bosses")} title="Select boss encounters only">Bosses</Button>
        <Button variant="outline" size="sm" className="h-5 px-1.5 text-xs" onClick={() => handleQuickSelect("trash")} title="Select trash encounters only">Trash</Button>
      </div>

      {/* Encounter list */}
      <div className="mt-3 space-y-1">
        {encounterNames.map((name) => {
          const isSelected = selectedEncounters.has(name)
          const isTrashEnc = trashNames.has(name)
          return (
            <div
              role="button"
              tabIndex={0}
              key={name}
              onClick={(e) => handleEncounterClick(name, e.ctrlKey || e.metaKey)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  handleEncounterClick(name, e.ctrlKey || e.metaKey)
                }
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-all duration-150 cursor-pointer",
                isSelected
                  ? "bg-primary-darker text-primary-foreground border-l-3 border-l-primary-foreground/70 shadow-sm"
                  : "hover:bg-accent/50 hover:translate-x-0.5",
                !isSelected && isTrashEnc && "text-muted-foreground",
                isTrashEnc && "mt-3 border-t border-white/5 pt-3",
              )}
              title={`${name} — Click to select, Ctrl+Click to toggle`}
            >
              <CheckCircle
                className={cn(
                  "h-4 w-4 shrink-0",
                  isTrashEnc ? "text-green-500/60" : "text-green-500",
                )}
              />
              <span className={cn("truncate flex-1", isTrashEnc && !isSelected && "italic")}>
                {name}
              </span>
            </div>
          )
        })}
      </div>

      {/* Info hint */}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground/50">
        Metrics reflect the selected encounters. Ctrl+Click to toggle individual encounters.
      </p>
    </>
  )

  return (
    <div className="flex">
      {/* Mobile backdrop (DPS only) */}
      {metric === "dps" && isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile FAB (DPS only) */}
      {metric === "dps" && isMobile && createPortal(
        <Button
          variant="default"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed bottom-8 left-8 z-50 h-14 w-14 rounded-full shadow-lg"
          title={sidebarOpen ? "Close encounters" : "Show encounters"}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
        </Button>,
        document.body,
      )}

      {/* Sidebar — desktop: always present (empty when not DPS to preserve layout), mobile: overlay */}
      {!isMobile && (
        <div className="pt-1 w-64 shrink-0 border-r pr-4 overflow-y-auto styled-scrollbar sticky top-4 max-h-[calc(100vh-2rem)]">
          {metric === "dps" && sidebarContent}
        </div>
      )}
      {metric === "dps" && isMobile && sidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-background border-r shadow-lg pl-4 pt-4 overflow-y-auto styled-scrollbar">
          {sidebarContent}
        </div>
      )}

      {/* Main area */}
      <div className={cn("min-w-0 flex-1 space-y-5", !isMobile && "pl-6")}>
        {/* Hero header with instance background */}
        <div className="rounded-lg border relative overflow-hidden">
          {/* Background image */}
          <div className="absolute inset-0 z-0">
            <img
              src={getInstanceBackground(instanceName)}
              alt=""
              className="h-full w-full object-cover opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/70 to-background/50" />
          </div>

          {/* Header content */}
          <div className="relative z-10 p-4 space-y-2">
            {/* Back + Title */}
            <div>
              <button
                onClick={handleBack}
                className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Rankings
              </button>
              <h1 className="text-2xl font-bold">{instanceName}</h1>
            </div>

            {/* Row 1: dropdowns left, view toggle right */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs min-w-[120px] justify-between">
                      {metric === "dps" ? "DPS Rankings" : metric === "killtime" ? "Kill Time" : "Success Rate"}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup value={metric} onValueChange={(v) => handleMetricChange(v as MetricTab)}>
                      <DropdownMenuRadioItem value="dps">DPS Rankings</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="killtime">Kill Time</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="success">Success Rate</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Difficulty filter (only when multiple difficulties exist) */}
                {availableDifficulties.length > 1 && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs min-w-[130px] justify-between">
                        {selectedDifficulties.size === 0
                          ? "All Difficulties"
                          : selectedDifficulties.size === 1
                            ? [...selectedDifficulties][0]
                            : `${selectedDifficulties.size} Difficulties`}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {availableDifficulties.map((diff) => (
                        <DropdownMenuCheckboxItem
                          key={diff}
                          checked={selectedDifficulties.size === 0 || selectedDifficulties.has(diff)}
                          onCheckedChange={() => handleToggleDifficulty(diff)}
                        >
                          {diff}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* DPS sub-tabs (only when DPS metric is active) */}
              {metric === "dps" && (
                <div className="flex gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
                  {(["boxplot", "leaderboard"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => handleDpsSubTabChange(t)}
                      className={cn(
                        "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                        dpsSubTab === t
                          ? "bg-white/15 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t === "boxplot" ? "Box Plot" : "Leaderboard"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Row 2: time period, right-aligned */}
            <div className="flex justify-end">
              <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
                {([
                  { value: "all" as const, label: "All Time" },
                  { value: "90d" as const, label: "90d" },
                  { value: "30d" as const, label: "30d" },
                  { value: "7d" as const, label: "7d" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleTimePeriodChange(opt.value)}
                    className={cn(
                      "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                      timePeriod === opt.value
                        ? "bg-[#5F8FA6] text-white"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        {metric === "dps" && (
          dpsSubTab === "boxplot" ? (
            <BoxPlotChart stats={boxPlotStats} title="DPS Distribution by Class & Spec" />
          ) : (
            <>
              <RankingsTable entries={leaderboardEntries} />
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    {totalCount.toLocaleString()} results
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page <= 1}
                      onClick={() => handlePageChange(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page >= totalPages}
                      onClick={() => handlePageChange(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )
        )}

        {metric === "killtime" && (
          <KillTimeContent stats={killTimeStats} />
        )}

        {metric === "success" && (
          <SuccessRateContent rates={successRates} />
        )}
      </div>
    </div>
  )
}

// ── Kill Time Content ────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, "0")}`
}

function KillTimeContent({ stats }: { stats: RankingsKillTimeStats[] }) {
  const scaleMax = Math.max(...stats.map((s) => s.max_secs), 1)
  const step = scaleMax <= 300 ? 30 : 60
  const ticks: number[] = []
  for (let v = 0; v <= scaleMax; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < scaleMax) ticks.push(Math.ceil(scaleMax / step) * step)
  const axisMax = ticks[ticks.length - 1]

  if (stats.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-muted-foreground">
        No kill time data available.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-5 text-sm font-medium text-muted-foreground">Kill Time by Encounter</h3>
      <div className="space-y-1.5">
        {stats.map((s) => {
          const pct = (v: number) => `${(v / axisMax) * 100}%`
          return (
            <div key={s.encounter_name} className="flex items-center gap-3 px-1 py-1.5 rounded-md hover:bg-muted/20 transition-colors">
              {/* Label */}
              <div className="w-40 shrink-0 text-xs font-medium truncate">{s.encounter_name}</div>

              {/* Box plot */}
              <div className="relative flex-1 h-7">
                {/* Whisker */}
                <div
                  className="absolute top-1/2 h-px -translate-y-1/2 bg-muted-foreground/30"
                  style={{ left: pct(s.min_secs), width: `calc(${pct(s.max_secs)} - ${pct(s.min_secs)})` }}
                />
                {/* Caps */}
                <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-muted-foreground/40" style={{ left: pct(s.min_secs) }} />
                <div className="absolute top-1/2 -translate-y-1/2 w-px h-2.5 bg-muted-foreground/40" style={{ left: pct(s.max_secs) }} />
                {/* IQR box */}
                <div
                  className="absolute top-1 bottom-1 rounded-sm border border-[#5F8FA6] bg-[#5F8FA6]/30"
                  style={{ left: pct(s.q1_secs), width: `calc(${pct(s.q3_secs)} - ${pct(s.q1_secs)})` }}
                />
                {/* Median */}
                <div
                  className="absolute top-0.5 bottom-0.5 w-0.5 rounded-full bg-[#5F8FA6]"
                  style={{ left: pct(s.median_secs) }}
                />
              </div>

              {/* Values */}
              <div className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                <span className="font-mono font-semibold text-foreground">{formatTime(s.median_secs)}</span>
                {" "}
                <span className="hidden sm:inline">({s.count})</span>
              </div>
            </div>
          )
        })}

        {/* X-axis */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-40 shrink-0" />
          <div className="relative flex-1 h-5">
            {ticks.map((v) => (
              <span
                key={v}
                className="absolute -translate-x-1/2 text-[10px] text-muted-foreground/60 font-mono"
                style={{ left: `${(v / axisMax) * 100}%` }}
              >
                {formatTime(v)}
              </span>
            ))}
          </div>
          <div className="w-20 shrink-0" />
        </div>
      </div>
    </div>
  )
}

// ── Success Rate Content ─────────────────────────────────────────────────

function SuccessRateContent({ rates }: { rates: RankingsSuccessRate[] }) {
  if (rates.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-muted-foreground">
        No success rate data available.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-5">
      <h3 className="mb-5 text-sm font-medium text-muted-foreground">Success Rate by Encounter</h3>
      <div className="space-y-2">
        {rates.map((r) => {
          const successPct = r.total > 0 ? Math.round((r.kills / r.total) * 100) : 0
          return (
            <div key={r.encounter_name} className="flex items-center gap-3 px-1 py-1.5 rounded-md hover:bg-muted/20 transition-colors">
              {/* Label */}
              <div className="w-40 shrink-0 text-xs font-medium truncate">{r.encounter_name}</div>

              {/* Bar */}
              <div className="relative flex-1 h-6 rounded-md bg-muted/20 overflow-hidden">
                {/* Success portion */}
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-green-500/70 transition-all duration-500"
                  style={{ width: `${successPct}%` }}
                />
                {/* Wipe portion */}
                <div
                  className="absolute inset-y-0 right-0 rounded-r-md bg-red-500/30"
                  style={{ width: `${100 - successPct}%` }}
                />
                {/* Percentage label */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[11px] font-semibold text-foreground drop-shadow-sm">
                    {successPct}%
                  </span>
                </div>
              </div>

              {/* Counts */}
              <div className="w-28 shrink-0 text-right text-xs text-muted-foreground">
                <span className="text-green-400">{r.kills}</span>
                {" / "}
                <span className="text-red-400">{r.wipes}</span>
                <span className="hidden sm:inline text-muted-foreground/60"> ({r.total})</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
