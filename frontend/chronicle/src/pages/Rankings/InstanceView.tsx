import { useCallback, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useSearchParams } from "react-router-dom"
import { ArrowLeft, CheckCircle, List, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/useIsMobile"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { cn } from "@/lib/utils"
import {
  getInstanceByName,
  getEncounterNames,
  getAllEntries,
  computeBoxPlotStatsBySpec,
} from "./mockData"
import type { TimePeriod } from "./timePeriod"
import { getTimePeriodDays } from "./timePeriod"
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
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
    return entries
  }, [instanceName, selectedEncounters, timePeriod, now])

  const boxPlotStats = useMemo(
    () => computeBoxPlotStatsBySpec(filteredEntries),
    [filteredEntries],
  )

  const leaderboardEntries = useMemo(() => {
    const sorted = [...filteredEntries].sort((a, b) => b.value - a.value)
    sorted.forEach((e, i) => { e.rank = i + 1 })
    return sorted.slice(0, 50)
  }, [filteredEntries])



  if (!instance) {
    return (
      <div className="text-center text-muted-foreground py-16">
        Instance not found: {instanceName}
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
      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile FAB */}
      {isMobile && createPortal(
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

      {/* Sidebar — desktop: sticky inline, mobile: fixed overlay */}
      {(!isMobile || sidebarOpen) && (
        <div
          className={cn(
            "pt-1 w-64 shrink-0 border-r pr-4 overflow-y-auto styled-scrollbar",
            !isMobile && "sticky top-4 max-h-[calc(100vh-2rem)]",
            isMobile && "fixed inset-y-0 left-0 z-50 bg-background border-r shadow-lg pl-4 pt-4",
          )}
        >
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
          <div className="relative z-10 p-4 space-y-3">
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

            {/* Tabs + Filters row */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {/* Tab selector */}
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

            {/* Time period filter */}
            <div className="flex gap-1 rounded-lg border border-white/10 bg-black/30 p-1 w-fit">
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
