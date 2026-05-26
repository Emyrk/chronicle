import { useCallback, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, Skull } from "lucide-react"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import {
  getInstanceByName,
  getEncounterNames,
  getAllEntries,
  computeBoxPlotStatsBySpec,
} from "./mockData"
import type { TimePeriod } from "./timePeriod"
import { getTimePeriodDays } from "./timePeriod"
import { RankingsFilters } from "./RankingsFilters"
import { BoxPlotChart } from "./BoxPlotChart"
import { RankingsTable } from "./RankingsTable"

// ── Types ─────────────────────────────────────────────────────────────────

type TabType = "boxplot" | "leaderboard"

const VALID_PERIODS = new Set<TimePeriod>(["all", "90d", "30d", "7d"])

interface InstanceViewProps {
  instanceName: string
}

// ── Component ─────────────────────────────────────────────────────────────

export function InstanceView({ instanceName }: InstanceViewProps) {
  const [params, setParams] = useSearchParams()
  const [now] = useState(() => Date.now())

  const instance = useMemo(() => getInstanceByName(instanceName), [instanceName])
  const encounterNames = useMemo(() => getEncounterNames(instanceName), [instanceName])
  const bossNames = useMemo(
    () => new Set(instance?.bosses.filter((b) => !b.isTrash).map((b) => b.name) ?? []),
    [instance],
  )
  const trashNames = useMemo(
    () => new Set(instance?.bosses.filter((b) => b.isTrash).map((b) => b.name) ?? []),
    [instance],
  )

  // ── URL state ────────────────────────────────────────────────────────

  const tab: TabType = params.get("tab") === "leaderboard" ? "leaderboard" : "boxplot"

  const timePeriod: TimePeriod = useMemo(() => {
    const raw = params.get("period")
    return raw && VALID_PERIODS.has(raw as TimePeriod) ? (raw as TimePeriod) : "all"
  }, [params])

  const selectedClasses: Set<WoWHeroClasses> = useMemo(() => {
    const raw = params.get("classes")
    if (!raw) return new Set<WoWHeroClasses>()
    return new Set(raw.split(",").filter(Boolean) as WoWHeroClasses[])
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
      next.delete("tab")
      next.delete("encounters")
      next.delete("period")
      next.delete("classes")
      return next
    })
  }, [setParams])

  const handleTabChange = useCallback(
    (t: TabType) => setParam("tab", t === "boxplot" ? null : t),
    [setParam],
  )

  const handleTimePeriodChange = useCallback(
    (p: TimePeriod) => setParam("period", p === "all" ? null : p),
    [setParam],
  )

  const handleToggleClass = useCallback(
    (cls: WoWHeroClasses) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        const current = new Set(
          (prev.get("classes") ?? "").split(",").filter(Boolean) as WoWHeroClasses[],
        )
        if (current.has(cls)) current.delete(cls)
        else current.add(cls)
        if (current.size === 0) next.delete("classes")
        else next.set("classes", [...current].join(","))
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

  // ── Filtered entries ─────────────────────────────────────────────────

  const filteredEntries = useMemo(() => {
    let entries = getAllEntries(instanceName)
    // Filter by selected encounters
    entries = entries.filter((e) => selectedEncounters.has(e.encounterName))
    // Filter by time period
    const days = getTimePeriodDays(timePeriod)
    if (days !== null) {
      const cutoff = now - days * 86400000
      entries = entries.filter((e) => new Date(e.date).getTime() >= cutoff)
    }
    // Filter by class
    if (selectedClasses.size > 0) {
      entries = entries.filter((e) => selectedClasses.has(e.className))
    }
    return entries
  }, [instanceName, selectedEncounters, timePeriod, selectedClasses, now])

  const boxPlotStats = useMemo(
    () => computeBoxPlotStatsBySpec(filteredEntries),
    [filteredEntries],
  )

  const leaderboardEntries = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => b.value - a.value)
    sorted.forEach((e, i) => { e.rank = i + 1 })
    return sorted.slice(0, 50)
  }, [filteredEntries])

  const allSelected = selectedEncounters.size === encounterNames.length
  const bossesOnly = bossNames.size > 0 && selectedEncounters.size === bossNames.size && [...bossNames].every((n) => selectedEncounters.has(n))
  const trashOnly = trashNames.size > 0 && selectedEncounters.size === trashNames.size && [...trashNames].every((n) => selectedEncounters.has(n))

  if (!instance) {
    return (
      <div className="text-center text-muted-foreground py-16">
        Instance not found: {instanceName}
      </div>
    )
  }

  return (
    <div className="flex gap-6">
      {/* Left sidebar — encounter selector */}
      <div className="hidden lg:block w-56 shrink-0">
        <div className="sticky top-8 space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Encounters
          </h3>

          {/* Quick-select */}
          <button
            onClick={() => handleQuickSelect("all")}
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-xs font-medium text-left transition-colors",
              allSelected
                ? "bg-[#5F8FA6]/20 text-[#5F8FA6]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
            )}
          >
            All Encounters
          </button>
          <button
            onClick={() => handleQuickSelect("bosses")}
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-xs font-medium text-left transition-colors",
              bossesOnly
                ? "bg-[#5F8FA6]/20 text-[#5F8FA6]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
            )}
          >
            Bosses
          </button>
          <button
            onClick={() => handleQuickSelect("trash")}
            className={cn(
              "w-full rounded-md px-3 py-1.5 text-xs font-medium text-left transition-colors",
              trashOnly
                ? "bg-[#5F8FA6]/20 text-[#5F8FA6]"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/20",
            )}
          >
            Trash
          </button>

          {/* Individual encounters */}
          <div className="space-y-0.5">
            {encounterNames.map((name) => {
              const active = selectedEncounters.has(name)
              const isTrash = trashNames.has(name)
              return (
                <button
                  key={name}
                  onClick={(e) => handleEncounterClick(name, e.ctrlKey || e.metaKey)}
                  className={cn(
                    "w-full rounded-md px-3 py-1.5 text-xs text-left transition-colors truncate",
                    active
                      ? "bg-white/5 text-foreground font-medium"
                      : "text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/10",
                    isTrash && "border-t border-white/5 mt-1 pt-2 italic",
                  )}
                  title={`${name} — Click to select, Ctrl+Click to toggle`}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Main area */}
      <div className="min-w-0 flex-1 space-y-5">
        {/* Header */}
        <div>
          <button
            onClick={handleBack}
            className="mb-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Rankings
          </button>
          <div className="flex items-center gap-2">
            <Skull className="h-6 w-6 text-[#5F8FA6]" />
            <h1 className="text-2xl font-bold">{instanceName}</h1>
          </div>
        </div>

        {/* Mobile encounter selector */}
        <div className="lg:hidden">
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => handleQuickSelect("all")}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                allSelected
                  ? "border-[#5F8FA6]/40 bg-[#5F8FA6]/20 text-[#5F8FA6]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
            <button
              onClick={() => handleQuickSelect("bosses")}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                bossesOnly
                  ? "border-[#5F8FA6]/40 bg-[#5F8FA6]/20 text-[#5F8FA6]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Bosses
            </button>
            <button
              onClick={() => handleQuickSelect("trash")}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                trashOnly
                  ? "border-[#5F8FA6]/40 bg-[#5F8FA6]/20 text-[#5F8FA6]"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              Trash
            </button>
            {encounterNames.map((name) => {
              const active = selectedEncounters.has(name)
              return (
                <button
                  key={name}
                  onClick={(e) => handleEncounterClick(name, e.ctrlKey || e.metaKey)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-xs transition-colors truncate max-w-[120px]",
                    active
                      ? "border-white/20 bg-white/5 text-foreground"
                      : "border-transparent text-muted-foreground/50 hover:text-muted-foreground",
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
            {(["boxplot", "leaderboard"] as const).map((t) => (
              <button
                key={t}
                onClick={() => handleTabChange(t)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  tab === t
                    ? "bg-[#5F8FA6] text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "boxplot" ? "Box Plot" : "Leaderboard"}
              </button>
            ))}
          </div>
        </div>

        {/* Filters */}
        <RankingsFilters
          selectedClasses={selectedClasses}
          onToggleClass={handleToggleClass}
          timePeriod={timePeriod}
          onTimePeriodChange={handleTimePeriodChange}
        />

        {/* Content */}
        {tab === "boxplot" ? (
          <BoxPlotChart stats={boxPlotStats} title="DPS Distribution by Class & Spec" />
        ) : (
          <RankingsTable entries={leaderboardEntries} />
        )}
      </div>
    </div>
  )
}
