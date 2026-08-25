import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, List, Loader2, X } from "lucide-react"
import { Checkbox } from "@/components/ui/Checkbox/Checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip/tooltip"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu/DropdownMenu"
import { useIsMobile } from "@/hooks/useIsMobile"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { cn } from "@/lib/utils"
import type { RankingsKillTimeStats, RankingsSuccessRate } from "@/api/typesGenerated"
import { useSiteConfig } from "@/api/queries"
import {
  useRankingsEncounters,
  useRankingsInstances,
  useRankingsStats,
  useRankingsLeaderboard,
  useRankingsKillTimes,
  useRankingsKillTimeLeaderboard,
  useRankingsSuccessRates,
  useRankingsRealms,
} from "@/api/rankingsQueries"
import type { RankedEntry } from "./RankingsTable"
import type { RankedKillTimeEntry } from "./KillTimeTable"
import type { TimePeriod } from "./timePeriod"
import { BoxPlotChart } from "./BoxPlotChart"
import { RankingsTable } from "./RankingsTable"
import { KillTimeTable } from "./KillTimeTable"
import { ClassSpecFilter } from "./ClassSpecFilter"
import {
  groupByParamForValue,
  parseGroupByClass,
  parseHideUnknowns,
  unknownsParamForValue,
  type RankingsCohortMode,
} from "./rankingsFilterState"

// ── Types ─────────────────────────────────────────────────────────────────

type MetricTab = "dps" | "hps" | "killtime" | "success"
type DpsSubTab = "boxplot" | "leaderboard"
type KillTimeSubTab = "boxplot" | "leaderboard"
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
  const { data: siteConfig } = useSiteConfig()
  const configuredCohortMode = siteConfig?.tenant?.parse_config?.cohort_mode
  const cohortMode: RankingsCohortMode =
    configuredCohortMode === "class" || configuredCohortMode === "disabled"
      ? configuredCohortMode
      : "spec"
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
    if (raw === "hps" || raw === "killtime" || raw === "success") return raw
    return "dps"
  }, [params])

  // DPS and HPS share the same leaderboard/box-plot UI; only the value metric differs.
  const isPlayerMetric = metric === "dps" || metric === "hps"
  const valueMetric: "dps" | "hps" = metric === "hps" ? "hps" : "dps"

  const dpsSubTab: DpsSubTab = params.get("tab") === "leaderboard" ? "leaderboard" : "boxplot"
  const killTimeSubTab: KillTimeSubTab = params.get("tab") === "leaderboard" ? "leaderboard" : "boxplot"
  const filterClass = params.get("class") ?? undefined
  const filterSpec = params.get("spec") ?? undefined
  const filterRole = useMemo(() => params.get("role") || "", [params])  // "" = all roles

  const page = useMemo(() => {
    const raw = params.get("page")
    const n = raw ? parseInt(raw, 10) : 1
    return Number.isFinite(n) && n >= 1 ? n : 1
  }, [params])

  const timePeriod: TimePeriod = useMemo(() => {
    const raw = params.get("period")
    return raw && VALID_PERIODS.has(raw as TimePeriod) ? (raw as TimePeriod) : "all"
  }, [params])

  // Class-cohort tenants include unknown specs and merge specs by default.
  // Explicit URL values preserve user overrides across tenant-default changes.
  const hideUnknowns = parseHideUnknowns(params.get("unknowns"), cohortMode)

  const handleToggleUnknowns = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      const currentValue = parseHideUnknowns(prev.get("unknowns"), cohortMode)
      const nextValue = unknownsParamForValue(!currentValue, cohortMode)
      if (nextValue === null) next.delete("unknowns")
      else next.set("unknowns", nextValue)
      next.delete("page")
      return next
    })
  }, [cohortMode, setParams])

  // Group box plot by class (merge specs).
  const groupByClass = parseGroupByClass(params.get("group_by"), cohortMode)

  const handleToggleGroupByClass = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      const currentValue = parseGroupByClass(prev.get("group_by"), cohortMode)
      const nextValue = groupByParamForValue(!currentValue, cohortMode)
      if (nextValue === null) next.delete("group_by")
      else next.set("group_by", nextValue)
      return next
    })
  }, [cohortMode, setParams])

  // Difficulty filter — kept in URL state but not yet a backend param
  const selectedDifficulties: Set<string> = useMemo(() => {
    const raw = params.get("diff")
    if (!raw) return new Set<string>()
    return new Set(raw.split(",").filter(Boolean))
  }, [params])

  // Realm filter — CSV of realm names in the URL, empty = all realms
  const selectedRealms: Set<string> = useMemo(() => {
    const raw = params.get("realms")
    if (!raw) return new Set<string>()
    return new Set(raw.split(",").filter(Boolean))
  }, [params])

  // Default (no URL param) = bosses only; trash is opt-in via ?encounters=.
  const selectedEncounters: Set<string> = useMemo(() => {
    const raw = params.get("encounters")
    if (!raw) return new Set(bossNames)
    return new Set(raw.split(",").filter(Boolean))
  }, [params, bossNames])

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
      next.delete("realms")
      next.delete("page")
      next.delete("class")
      next.delete("spec")
      next.delete("role")
      next.delete("kt_enc")
      return next
    })
  }, [setParams])

  const handleMetricChange = useCallback(
    (m: MetricTab) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (m === "dps") next.delete("metric")
        else next.set("metric", m)
        // Clear sub-tab and kill-time encounter when switching metrics
        next.delete("tab")
        next.delete("page")
        next.delete("kt_enc")
        next.delete("role")
        return next
      })
    },
    [setParams],
  )

  const handleDpsSubTabChange = useCallback(
    (t: DpsSubTab) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (t === "boxplot") {
          next.delete("tab")
          next.delete("class")
          next.delete("spec")
          next.delete("page")
        } else {
          next.set("tab", t)
        }
        return next
      })
    },
    [setParams],
  )
  const handleKillTimeSubTabChange = useCallback(
    (t: KillTimeSubTab) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (t === "boxplot") {
          next.delete("tab")
          next.delete("page")
        } else {
          next.set("tab", t)
          next.delete("page")
        }
        return next
      })
    },
    [setParams],
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

  const handleRoleChange = useCallback(
    (role: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (role === "") next.delete("role")
        else next.set("role", role)
        next.delete("page")
        next.delete("class")
        next.delete("spec")
        return next
      })
    },
    [setParams],
  )

  const handlePageChange = useCallback(
    (newPage: number) => setParam("page", newPage <= 1 ? null : String(newPage)),
    [setParam],
  )

  const handleBoxPlotRowClick = useCallback(
    (playerClass: string, playerSpec: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("tab", "leaderboard")
        next.set("class", playerClass)
        if (playerSpec) next.set("spec", playerSpec)
        else next.delete("spec")
        next.delete("page")
        return next
      })
    },
    [setParams],
  )

  const handleClassSelect = useCallback(
    (cls: string | null) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (cls) next.set("class", cls)
        else next.delete("class")
        next.delete("spec")
        next.delete("page")
        return next
      })
    },
    [setParams],
  )

  const handleSpecSelect = useCallback(
    (spec: string | null) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (spec) next.set("spec", spec)
        else next.delete("spec")
        next.delete("page")
        return next
      })
    },
    [setParams],
  )

  const handleEncounterClick = useCallback(
    (name: string, ctrlKey: boolean) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const raw = prev.get("encounters")
        const current = raw ? new Set(raw.split(",").filter(Boolean)) : new Set(bossNames)

        if (ctrlKey) {
          // Toggle individual
          if (current.has(name)) current.delete(name)
          else current.add(name)
        } else {
          // Single-select: if already solo-selected, reset to default (bosses); otherwise select only this one
          if (current.size === 1 && current.has(name)) {
            next.delete("encounters")
            return next
          }
          current.clear()
          current.add(name)
        }

        // No param = default (bosses only). An empty selection also resets to default.
        const isDefault =
          current.size === bossNames.size && [...current].every((n) => bossNames.has(n))
        if (current.size === 0 || isDefault) {
          next.delete("encounters")
        } else {
          next.set("encounters", [...current].join(","))
        }
        return next
      })
    },
    [setParams, bossNames],
  )

  const handleQuickSelect = useCallback(
    (mode: "all" | "bosses" | "trash") => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (mode === "bosses" || (mode === "all" && trashNames.size === 0)) {
          // Bosses only is the default — no param needed.
          next.delete("encounters")
        } else {
          const names = mode === "all" ? encounterNames : [...trashNames]
          next.set("encounters", [...names].join(","))
        }
        return next
      })
    },
    [setParams, encounterNames, trashNames],
  )

  // ── API query params ─────────────────────────────────────────────────

  const encounterNamesParam = useMemo(() => {
    if (selectedEncounters.size === 0 || selectedEncounters.size === encounterNames.length) return undefined
    return [...selectedEncounters].join(",")
  }, [selectedEncounters, encounterNames.length])

  const periodParam = timePeriod === "all" ? undefined : timePeriod

  // ── Data hooks ─────────────────────────────────────────────────────

  // Build difficulty_names CSV for server-side filtering
  const difficultyNamesParam = selectedDifficulties.size > 0
    ? [...selectedDifficulties].join(",")
    : undefined

  // Build realm_names CSV for server-side filtering
  const realmNamesParam = selectedRealms.size > 0
    ? [...selectedRealms].join(",")
    : undefined

  const { data: rawBoxPlotStats = [] } = useRankingsStats({
    instance_names: instanceName,
    encounter_names: encounterNamesParam,
    difficulty_names: difficultyNamesParam,
    realm_names: realmNamesParam,
    period: periodParam,
    role: filterRole,
    metric: valueMetric,
    group_by_class: groupByClass,
  })

  const boxPlotStats = useMemo(() => {
    if (!hideUnknowns) return rawBoxPlotStats
    return rawBoxPlotStats.filter((s) => s.player_class !== "Unknown" && s.player_spec !== "Unknown")
  }, [rawBoxPlotStats, hideUnknowns])

  const { data: leaderboardData } = useRankingsLeaderboard({
    instance_names: instanceName,
    encounter_names: encounterNamesParam,
    difficulty_names: difficultyNamesParam,
    realm_names: realmNamesParam,
    period: periodParam,
    class: filterClass,
    spec: filterSpec,
    role: filterRole,
    hide_unknowns: hideUnknowns,
    metric: valueMetric,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  // Derive available difficulties from instance summaries (unaffected by difficulty filter)
  const { data: instanceSummaries } = useRankingsInstances()
  const availableDifficulties = useMemo(() => {
    const seen = new Set<string>()
    for (const s of instanceSummaries ?? []) {
      if (s.instance_name === instanceName && s.difficulty_name) {
        seen.add(s.difficulty_name)
      }
    }
    return [...seen].sort()
  }, [instanceSummaries, instanceName])

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

  // Realms available for the filter dropdown
  const { data: availableRealms = [] } = useRankingsRealms()

  const handleToggleRealm = useCallback(
    (realm: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const raw = prev.get("realms")
        const current = raw ? new Set(raw.split(",").filter(Boolean)) : new Set<string>()
        if (current.has(realm)) current.delete(realm)
        else current.add(realm)
        if (current.size === 0 || current.size === availableRealms.length) {
          next.delete("realms")
        } else {
          next.set("realms", [...current].join(","))
        }
        next.delete("page") // reset to page 1
        return next
      })
    },
    [setParams, availableRealms.length],
  )

  // "All" checkbox: clear the realm filter entirely (no filter = all realms).
  const handleSelectAllRealms = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("realms")
      next.delete("page") // reset to page 1
      return next
    })
  }, [setParams])

  // Difficulty shown next to the instance name: the filtered selection, or
  // the only available difficulty when the instance has just one.
  const headerDifficulty = useMemo(() => {
    if (selectedDifficulties.size > 0) return [...selectedDifficulties].sort().join(", ")
    if (availableDifficulties.length === 1) return availableDifficulties[0]
    return ""
  }, [selectedDifficulties, availableDifficulties])

  const totalCount = leaderboardData?.total_count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const leaderboardEntries: RankedEntry[] = useMemo(() => {
    const entries = leaderboardData?.entries ?? []
    const offset = (page - 1) * PAGE_SIZE
    return entries.map((e, i) => ({ ...e, rank: offset + i + 1 }))
  }, [leaderboardData, page])

  const { data: killTimeStats = [] } = useRankingsKillTimes(instanceName, periodParam)

  // Kill time leaderboard: always a single encounter (mixing bosses is meaningless).
  // Persisted via ?kt_enc= URL param; defaults to the first boss.
  const bossList = useMemo(() => [...bossNames].sort(), [bossNames])
  const killTimeEncounter = useMemo(() => {
    const raw = params.get("kt_enc")
    if (raw && bossNames.has(raw)) return raw
    return bossList[0] ?? ""
  }, [params, bossNames, bossList])

  const handleKillTimeEncounterChange = useCallback(
    (enc: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("kt_enc", enc)
        next.delete("page")
        return next
      })
    },
    [setParams],
  )

  const { data: killTimeLeaderboardData } = useRankingsKillTimeLeaderboard({
    instance_name: instanceName,
    encounter_name: killTimeEncounter,
    period: periodParam,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })

  const killTimeTotalCount = killTimeLeaderboardData?.total_count ?? 0
  const killTimeTotalPages = Math.max(1, Math.ceil(killTimeTotalCount / PAGE_SIZE))

  const killTimeEntries: RankedKillTimeEntry[] = useMemo(() => {
    const entries = killTimeLeaderboardData?.entries ?? []
    const offset = (page - 1) * PAGE_SIZE
    return entries.map((e, i) => ({ ...e, rank: offset + i + 1 }))
  }, [killTimeLeaderboardData, page])

  const { data: successRates = [] } = useRankingsSuccessRates(instanceName, periodParam, {
    difficulty_names: difficultyNamesParam,
  })

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
      {isPlayerMetric && isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile FAB (DPS only) */}
      {isPlayerMetric && isMobile && createPortal(
        <Button
          variant="default"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 h-11 w-11 rounded-full border border-white/10 shadow-xl sm:right-6 sm:h-12 sm:w-12"
          title={sidebarOpen ? "Close encounters" : "Show encounters"}
          aria-label={sidebarOpen ? "Close encounter filters" : "Show encounter filters"}
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
        </Button>,
        document.body,
      )}

      {/* Sidebar — desktop: always present (empty when not DPS to preserve layout), mobile: overlay */}
      {!isMobile && (
        <div className="pt-1 w-64 shrink-0 border-r pr-4 overflow-y-auto styled-scrollbar sticky top-4 max-h-[calc(100vh-2rem)]">
          {isPlayerMetric && sidebarContent}
        </div>
      )}
      {isPlayerMetric && isMobile && sidebarOpen && (
        <div className="fixed inset-y-0 left-0 z-50 w-[min(20rem,88vw)] overflow-y-auto border-r bg-background px-4 pt-4 shadow-2xl styled-scrollbar">
          {sidebarContent}
        </div>
      )}

      {/* Main area */}
      <div className={cn("min-w-0 flex-1 space-y-4 sm:space-y-5", !isMobile && "pl-6")}>
        {/* Hero header with instance background */}
        <div className="relative overflow-hidden rounded-xl border">
          {/* Background image */}
          <div className="absolute inset-0 z-0">
            <img
              src={getInstanceBackground(instanceName)}
              alt=""
              className="h-full w-full object-cover opacity-45 sm:opacity-70"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/75 to-background/95 sm:bg-gradient-to-r sm:from-background/90 sm:via-background/70 sm:to-background/50" />
          </div>

          {/* Header content — two columns, both touch bottom */}
          <div className="relative z-10 flex flex-col gap-4 p-3 sm:flex-row sm:p-4">
            {/* Left: back, title, dropdowns */}
            <div className="flex-1 flex flex-col justify-between gap-2">
              <div>
                <button
                  onClick={handleBack}
                  className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to Rankings
                </button>
                <h1 className="flex flex-wrap items-baseline gap-x-2 text-xl font-bold leading-tight sm:text-2xl">
                  <span>{instanceName}</span>
                  {headerDifficulty && (
                    <span className="text-sm font-normal text-muted-foreground sm:text-lg">{headerDifficulty}</span>
                  )}
                </h1>
              </div>

              <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap">
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-full min-w-0 justify-between gap-1.5 px-2 text-xs sm:h-7 sm:w-auto sm:min-w-[120px] sm:px-3">
                      {metric === "dps" ? "DPS Rankings" : metric === "hps" ? "HPS Rankings" : metric === "killtime" ? "Kill Time" : "Success Rate"}
                      <ChevronDown className="h-3 w-3 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup value={metric} onValueChange={(v) => handleMetricChange(v as MetricTab)}>
                      <DropdownMenuRadioItem value="dps">DPS Rankings</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="hps">HPS Rankings</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="killtime">Kill Time</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="success">Success Rate</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>

                {isPlayerMetric && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-full min-w-0 justify-between gap-1.5 px-2 text-xs sm:h-7 sm:w-auto sm:min-w-[80px] sm:px-3">
                        {filterRole === "" ? "All Roles" : filterRole === "dps" ? "DPS" : filterRole === "heal" ? "Healer" : "Tank"}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuRadioGroup value={filterRole} onValueChange={(v) => handleRoleChange(v)}>
                        <DropdownMenuRadioItem value="">All Roles</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="dps">DPS</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="tank">Tank</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="heal">Healer</DropdownMenuRadioItem>
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {availableDifficulties.length > 1 && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-full min-w-0 justify-between gap-1.5 px-2 text-xs sm:h-7 sm:w-auto sm:min-w-[130px] sm:px-3">
                        {selectedDifficulties.size === 0
                          ? "All Difficulties"
                          : selectedDifficulties.size === 1
                            ? [...selectedDifficulties][0]
                            : `${selectedDifficulties.size} Difficulties`}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {availableDifficulties.map((diff) => {
                        const checked = selectedDifficulties.size === 0 || selectedDifficulties.has(diff)
                        return (
                          <DropdownMenuItem
                            key={diff}
                            onSelect={(e) => {
                              e.preventDefault()
                              handleToggleDifficulty(diff)
                            }}
                            className="gap-2"
                          >
                            <Checkbox checked={checked} className="pointer-events-none" />
                            {diff}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {isPlayerMetric && availableRealms.length > 1 && (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-full min-w-0 justify-between gap-1.5 px-2 text-xs sm:h-7 sm:w-auto sm:min-w-[110px] sm:px-3">
                        {selectedRealms.size === 0
                          ? "All Realms"
                          : selectedRealms.size === 1
                            ? [...selectedRealms][0]
                            : `${selectedRealms.size} Realms`}
                        <ChevronDown className="h-3 w-3 opacity-50" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault()
                          handleSelectAllRealms()
                        }}
                        className="gap-2"
                      >
                        <Checkbox checked={selectedRealms.size === 0} className="pointer-events-none" />
                        All
                      </DropdownMenuItem>
                      {availableRealms.map((realm) => {
                        const checked = selectedRealms.size === 0 || selectedRealms.has(realm)
                        return (
                          <DropdownMenuItem
                            key={realm}
                            onSelect={(e) => {
                              e.preventDefault()
                              handleToggleRealm(realm)
                            }}
                            className="gap-2"
                          >
                            <Checkbox checked={checked} className="pointer-events-none" />
                            {realm}
                          </DropdownMenuItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <label className="flex min-h-8 items-center gap-2 rounded-md border border-white/5 bg-black/20 px-2 text-xs text-muted-foreground cursor-pointer select-none sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0">
                  <Checkbox
                    checked={hideUnknowns}
                    onCheckedChange={() => handleToggleUnknowns()}
                    className="size-3.5"
                  />
                  Hide unknowns
                </label>

                {isPlayerMetric && dpsSubTab === "boxplot" && (
                  <label className="flex min-h-8 items-center gap-2 rounded-md border border-white/5 bg-black/20 px-2 text-xs text-muted-foreground cursor-pointer select-none sm:min-h-0 sm:border-0 sm:bg-transparent sm:px-0">
                    <Checkbox
                      checked={groupByClass}
                      onCheckedChange={() => handleToggleGroupByClass()}
                      className="size-3.5"
                    />
                    Merge specs
                  </label>
                )}
              </div>
            </div>

            {/* Right: sub-tabs + time period, bottom-aligned */}
            <div className="flex w-full shrink-0 flex-col justify-end gap-2 sm:w-auto sm:items-end">
              {(isPlayerMetric || metric === "killtime") && (
                <div className="flex w-full gap-1 rounded-lg border border-white/10 bg-black/20 p-1 sm:w-auto">
                  {(["boxplot", "leaderboard"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() =>
                        isPlayerMetric
                          ? handleDpsSubTabChange(t)
                          : handleKillTimeSubTabChange(t)
                      }
                      className={cn(
                        "flex-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors sm:flex-none sm:py-0.5",
                        (isPlayerMetric ? dpsSubTab : killTimeSubTab) === t
                          ? "bg-white/15 text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {t === "boxplot" ? "Box Plot" : "Leaderboard"}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex w-full gap-1 rounded-lg border border-white/10 bg-black/30 p-1 sm:w-auto">
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
                      "flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:flex-none sm:px-3 sm:py-1",
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

        {/* Multi-encounter notice */}
        {isPlayerMetric && selectedEncounters.size > 1 && (
          <p className="rounded-lg border border-white/5 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-xs sm:italic">
            Showing combined {valueMetric.toUpperCase()} across {selectedEncounters.size} encounters per run.
            Runs missing any selected encounter are excluded.
          </p>
        )}

        {/* Content */}
        {isPlayerMetric && (
          dpsSubTab === "boxplot" ? (
            <BoxPlotChart
              stats={boxPlotStats}
              title={`${valueMetric.toUpperCase()} Distribution by Class & Spec`}
              subtitle={`${boxPlotStats.reduce((sum, s) => sum + s.count, 0).toLocaleString()} total runs`}
              onRowClick={handleBoxPlotRowClick}
            />
          ) : (
            <>
              <ClassSpecFilter
                selectedClass={filterClass ?? null}
                selectedSpec={filterSpec ?? null}
                onClassSelect={handleClassSelect}
                onSpecSelect={handleSpecSelect}
              />
              <RankingsTable entries={leaderboardEntries} metric={valueMetric} />
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    {totalCount.toLocaleString()} players
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
          killTimeSubTab === "boxplot" ? (
            <KillTimeContent stats={killTimeStats} />
          ) : (
            <>
              {/* Encounter selector — kill times only make sense per-boss */}
              <div className="flex flex-wrap items-center gap-1.5">
                {bossList.map((enc) => (
                  <button
                    key={enc}
                    onClick={() => handleKillTimeEncounterChange(enc)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                      killTimeEncounter === enc
                        ? "border-[#5F8FA6] bg-[#5F8FA6]/20 text-foreground"
                        : "border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5",
                    )}
                  >
                    {enc}
                  </button>
                ))}
              </div>
              <KillTimeTable entries={killTimeEntries} />
              {/* Pagination */}
              {killTimeTotalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-muted-foreground">
                    {killTimeTotalCount.toLocaleString()} kills
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
                      Page {page} of {killTimeTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={page >= killTimeTotalPages}
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
  const sWhole = Math.floor(s)
  const sFrac = s - sWhole
  const fracStr = sFrac > 0 ? `.${sFrac.toFixed(2).slice(2)}` : ""
  return `${m}:${String(sWhole).padStart(2, "0")}${fracStr}`
}

function KillTimeContent({ stats }: { stats: RankingsKillTimeStats[] }) {
  const scaleMax = Math.max(...stats.map((s) => s.max_secs), 1)
  const step = scaleMax <= 300 ? 30 : 60
  const ticks: number[] = []
  for (let v = 0; v <= scaleMax; v += step) ticks.push(v)
  if (ticks[ticks.length - 1] < scaleMax) ticks.push(Math.ceil(scaleMax / step) * step)
  const axisMax = ticks[ticks.length - 1]
  const mobileTicks = [0, axisMax / 2, axisMax]

  if (stats.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-muted-foreground">
        No kill time data available.
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-5">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground sm:mb-5">Kill Time by Encounter</h3>
      {/* Column header */}
      <div className="hidden items-center gap-3 px-1 pb-1 sm:flex">
        <div className="w-40 shrink-0" />
        <div className="flex-1" />
        <div className="w-28 shrink-0 text-right text-[10px] text-muted-foreground/60">Avg (sample count)</div>
      </div>
      <TooltipProvider>
      <div className="space-y-1.5">
        {stats.map((s) => {
          const pct = (v: number) => `${(v / axisMax) * 100}%`
          const iqr = s.q3_secs - s.q1_secs
          return (
            <Tooltip key={s.encounter_name}>
              <TooltipTrigger asChild>
                <div className="relative h-10 rounded-md border-l-2 border-[#5F8FA6] pl-2 transition-colors hover:bg-muted/20 cursor-default sm:flex sm:h-auto sm:items-center sm:gap-3 sm:border-l-0 sm:px-1 sm:py-1.5">
                  {/* Encounter name and mobile median overlap the top of the plot. */}
                  <div className="absolute inset-x-2 top-0 z-10 flex items-center text-xs sm:static sm:w-40 sm:shrink-0">
                    <span className="min-w-0 truncate bg-card/90 pr-2 font-medium backdrop-blur-[1px] sm:bg-transparent sm:pr-0 sm:backdrop-blur-none">
                      {s.encounter_name}
                    </span>
                    <span className="ml-auto shrink-0 bg-card/90 pl-2 font-mono font-semibold tabular-nums text-foreground backdrop-blur-[1px] sm:hidden">
                      {formatTime(s.median_secs)}
                    </span>
                  </div>

                  {/* Box plot */}
                  <div className="absolute inset-x-2 bottom-0 h-7 sm:relative sm:inset-auto sm:flex-1">
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

                  {/* Desktop median (sample count) */}
                  <div className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground sm:block">
                    <span className="font-mono font-semibold text-foreground">{formatTime(s.median_secs)}</span>
                    {" "}
                    <span className="text-muted-foreground/60">({s.count})</span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                sideOffset={6}
                hideArrow
                className="bg-popover border border-white/10 rounded-lg shadow-lg p-3 text-foreground w-56"
              >
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-semibold">{s.encounter_name}</span>
                  <span className="text-[10px] text-muted-foreground">{s.count.toLocaleString()} kills</span>
                </div>
                <div className="space-y-1 text-xs">
                  <TimeStatLine label="Fastest" value={formatTime(s.min_secs)} />
                  <TimeStatLine label="Top 25%" value={formatTime(s.q1_secs)} />
                  <TimeStatLine label="Typical" value={formatTime(s.median_secs)} highlight />
                  <TimeStatLine label="Bottom 25%" value={formatTime(s.q3_secs)} />
                  <TimeStatLine label="Slowest" value={formatTime(s.max_secs)} />
                  <div className="border-t border-white/5 pt-1 mt-1">
                    <TimeStatLine label="Spread" desc="IQR (Q3 − Q1)" value={formatTime(iqr)} />
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {/* X-axis */}
        <div className="flex items-center gap-3 pt-2 sm:px-1">
          <div className="hidden w-40 shrink-0 sm:block" />
          <div className="relative h-5 flex-1">
            {mobileTicks.map((v, i) => (
              <span
                key={`mobile-${v}`}
                className={`absolute font-mono text-[10px] text-muted-foreground/60 sm:hidden ${
                  i === 0 ? "" : i === mobileTicks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"
                }`}
                style={{ left: `${(v / axisMax) * 100}%` }}
              >
                {formatTime(v)}
              </span>
            ))}
            {ticks.map((v) => (
              <span
                key={v}
                className="absolute hidden -translate-x-1/2 font-mono text-[10px] text-muted-foreground/60 sm:block"
                style={{ left: `${(v / axisMax) * 100}%` }}
              >
                {formatTime(v)}
              </span>
            ))}
          </div>
          <div className="hidden w-28 shrink-0 sm:block" />
        </div>
      </div>
      </TooltipProvider>
    </div>
  )
}

function TimeStatLine({ label, desc, value, highlight }: { label: string; desc?: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <span className={highlight ? "font-semibold text-foreground" : "text-foreground"}>{label}</span>
        {desc && <span className="text-[10px] text-muted-foreground/50 ml-1">{desc}</span>}
      </div>
      <span className={`font-mono shrink-0 ${highlight ? "font-semibold text-foreground" : "font-medium"}`}>
        {value}
      </span>
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
    <div className="rounded-xl border bg-card p-3 sm:p-5">
      <h3 className="mb-3 text-sm font-medium text-muted-foreground sm:mb-5">Success Rate by Encounter</h3>
      <div className="space-y-1.5 sm:space-y-2">
        {rates.map((r) => {
          const successPct = r.total > 0 ? Math.round((r.kills / r.total) * 100) : 0
          return (
            <div key={r.encounter_name} className="relative h-10 rounded-md border-l-2 border-green-500/70 pl-2 transition-colors hover:bg-muted/20 sm:flex sm:h-auto sm:items-center sm:gap-3 sm:border-l-0 sm:px-1 sm:py-1.5">
              {/* Encounter and mobile counts overlap the top of the bar. */}
              <div className="absolute inset-x-2 top-0 z-10 flex items-center text-xs sm:static sm:w-40 sm:shrink-0">
                <span className="min-w-0 truncate bg-card/90 pr-2 font-medium backdrop-blur-[1px] sm:bg-transparent sm:pr-0 sm:backdrop-blur-none">
                  {r.encounter_name}
                </span>
                <span className="ml-auto shrink-0 bg-card/90 pl-2 text-[11px] backdrop-blur-[1px] sm:hidden">
                  <span className="text-green-400">{r.kills}</span>
                  {" / "}
                  <span className="text-red-400">{r.wipes}</span>
                </span>
              </div>

              {/* Bar */}
              <div className="absolute inset-x-2 bottom-0 h-6 overflow-hidden rounded-md bg-muted/20 sm:relative sm:inset-auto sm:flex-1">
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

              {/* Desktop counts */}
              <div className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground sm:block">
                <span className="text-green-400">{r.kills}</span>
                {" / "}
                <span className="text-red-400">{r.wipes}</span>
                <span className="text-muted-foreground/60"> ({r.total})</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
