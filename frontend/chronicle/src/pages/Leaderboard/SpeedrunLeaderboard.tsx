import { useSearchParams } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { Loader2, SlidersHorizontal, Check, Users, Globe, X, ChevronDown, Info, ArrowLeft, Trophy } from "lucide-react"
import { getInstanceConfig, getInstanceBackground } from "../Logs/utils/instanceImages"
import { getInstanceCategory } from "../Logs/utils/instanceCategory"
import { useSupportedInstances } from "@/api/queries"
import { useState, useEffect, useCallback, useRef } from "react"
import type { SpeedrunInstanceBoard, SpeedrunLeaderboardEntry, SpeedrunRulesResponse } from "../../api/typesGenerated"
import { Podium } from "./Podium"
import { LeaderboardTable } from "./LeaderboardTable"
import { useLocalStorage } from "../../hooks/useLocalStorage"
import { SpeedrunTimingToggle } from "./SpeedrunTimingToggle"
import {
  resolveSpeedrunTimingMode,
  SPEEDRUN_TIMING_STORAGE_KEY,
  type SpeedrunTimingMode,
} from "./speedrunTimingPreference"

const SPEEDRUN_STALE_TIME = 5 * 60 * 1000 // 5 minutes

// Each (instance, difficulty) combination is its own board.
function useSpeedrunBoards() {
  return useQuery<SpeedrunInstanceBoard[]>({
    queryKey: ["leaderboard", "speedrun", "instances"],
    queryFn: async () => {
      const res = await fetch("/api/v1/rankings/speedrun/instances")
      if (!res.ok) throw new Error("Failed to fetch instances")
      const data: (SpeedrunInstanceBoard | string)[] = await res.json()
      // Older backends returned plain instance-name strings. Normalize so a
      // stale API doesn't crash the page.
      return data.map((item) =>
        typeof item === "string"
          ? { instance_name: item, difficulty_name: "" }
          : item
      )
    },
    staleTime: SPEEDRUN_STALE_TIME,
  })
}

function useSpeedrunRealms() {
  return useQuery<string[]>({
    queryKey: ["leaderboard", "speedrun", "realms"],
    queryFn: async () => {
      const res = await fetch("/api/v1/rankings/speedrun/realms")
      if (!res.ok) throw new Error("Failed to fetch realms")
      return res.json()
    },
    staleTime: SPEEDRUN_STALE_TIME,
  })
}

// Each difficulty has its own board. `difficulty` may be an empty string
// (runs with no recorded difficulty); pass null to skip filtering entirely.
function useSpeedrunLeaderboard(
  instanceName: string,
  realmNames: string[],
  minPlayers: string,
  maxPlayers: string,
  sinceDays: string,
  difficulty: string | null,
  timing: SpeedrunTimingMode
) {
  return useQuery<SpeedrunLeaderboardEntry[]>({
    queryKey: ["leaderboard", "speedrun", instanceName, realmNames, minPlayers, maxPlayers, sinceDays, difficulty, timing],
    queryFn: async () => {
      const params = new URLSearchParams()
      params.set("instance_name", instanceName)
      for (const r of realmNames) {
        params.append("realm_name", r)
      }
      if (minPlayers) params.set("min_players", minPlayers)
      if (maxPlayers) params.set("max_players", maxPlayers)
      if (sinceDays) params.set("since_days", sinceDays)
      if (difficulty !== null) params.set("difficulty_name", difficulty)
      params.set("timing", timing)
      const res = await fetch(`/api/v1/rankings/speedrun?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to fetch leaderboard")
      return res.json()
    },
    enabled: !!instanceName,
    staleTime: SPEEDRUN_STALE_TIME,
  })
}

function useSpeedrunDifficulties(instanceName: string) {
  return useQuery<string[]>({
    queryKey: ["leaderboard", "speedrun", "difficulties", instanceName],
    queryFn: async () => {
      const res = await fetch(`/api/v1/rankings/speedrun/difficulties?instance_name=${encodeURIComponent(instanceName)}`)
      if (!res.ok) throw new Error("Failed to fetch difficulties")
      return res.json()
    },
    enabled: !!instanceName,
    staleTime: SPEEDRUN_STALE_TIME,
  })
}

// Empty difficulty_name means the log did not record one (older logs / default).
function difficultyLabel(difficulty: string): string {
  return difficulty === "" ? "Normal" : difficulty
}

// "Naxxramas" + "25 Player" → "Naxxramas (25 Player)". Boards without a
// recorded difficulty keep the bare instance name.
function boardTitle(instanceName: string, difficulty: string): string {
  return difficulty === "" ? instanceName : `${instanceName} (${difficulty})`
}

function useSpeedrunRules(instanceName: string) {
  return useQuery<SpeedrunRulesResponse>({
    queryKey: ["leaderboard", "speedrun", "rules", instanceName],
    queryFn: async () => {
      const res = await fetch(`/api/v1/rankings/speedrun/rules?instance_name=${encodeURIComponent(instanceName)}`)
      if (!res.ok) throw new Error("Failed to fetch rules")
      return res.json()
    },
    enabled: !!instanceName,
    staleTime: SPEEDRUN_STALE_TIME,
  })
}

function RulesModal({ open, onClose, instanceName, rules }: {
  open: boolean
  onClose: () => void
  instanceName: string
  rules: SpeedrunRulesResponse | undefined
}) {
  if (!open) return null

  const bosses = rules?.requirements.filter(r => r.category === "Bosses") ?? []
  const trash = rules?.requirements.filter(r => r.category === "Trash") ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md max-h-[85vh] flex flex-col bg-popover border rounded-t-2xl md:rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Speedrun Rules — {instanceName}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {!rules ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                All listed kills must occur in a single log to qualify. Timer runs from first boss kill to last.
              </p>
              {bosses.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bosses</h3>
                  <ul className="space-y-1">
                    {bosses.map((r) => (
                      <li key={r.name} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                        {r.name}
                        {r.count > 1 && <span className="text-muted-foreground">×{r.count}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {trash.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Trash</h3>
                  <ul className="space-y-1">
                    {trash.map((r) => (
                      <li key={r.name} className="flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                        {r.name}
                        {r.count > 1 && <span className="text-muted-foreground">×{r.count}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {rules.level_range && (
                <div>
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">Level Requirement</h3>
                  <p className="text-sm">
                    All engaged players must be level{" "}
                    {rules.level_range.min_level === rules.level_range.max_level
                      ? rules.level_range.min_level
                      : `${rules.level_range.min_level}–${rules.level_range.max_level}`}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
}: {
  options: string[]
  selected: string[]
  onChange: (selected: string[]) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    )
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? selected[0]
        : `${selected.length} selected`

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-lg border bg-muted text-sm text-foreground"
      >
        <span className={selected.length === 0 ? "text-muted-foreground" : ""}>
          {label}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 z-50 rounded-lg border bg-popover shadow-md max-h-48 overflow-y-auto">
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted text-muted-foreground border-b"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
          {options.map((option) => {
            const isSelected = selected.includes(option)
            return (
              <button
                key={option}
                onClick={() => toggle(option)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${
                  isSelected
                    ? "bg-[#5F8FA6]/10 text-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                <div
                  className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "bg-[#5F8FA6] border-[#5F8FA6]" : "border-muted-foreground/30"
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>
                {option}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface CriteriaState {
  instance: string
  realms: string[]
  minPlayers: string
  maxPlayers: string
}

function CriteriaModal({
  open,
  onClose,
  availableInstances,
  availableRealms,
  initial,
  onApply,
}: {
  open: boolean
  onClose: () => void
  availableInstances: string[]
  availableRealms: string[]
  initial: CriteriaState
  onApply: (state: CriteriaState) => void
}) {
  const [draft, setDraft] = useState<CriteriaState>(initial)

  // Sync draft when modal opens
  useEffect(() => {
    if (open) setDraft(initial)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleApply = () => {
    onApply(draft)
    onClose()
  }

  const handleReset = () => {
    setDraft({ instance: draft.instance, realms: [], minPlayers: "", maxPlayers: "" })
  }

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose()
    },
    [onClose]
  )

  if (!open) return null

  const hasFilters =
    draft.realms.length > 0 || draft.minPlayers !== "" || draft.maxPlayers !== ""

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50"
      onClick={handleBackdropClick}
    >
      <div className="w-full max-w-md max-h-[85vh] flex flex-col bg-popover border rounded-t-2xl md:rounded-2xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-base font-semibold">Filter Criteria</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Instance Filter */}
          {availableInstances.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-3">
                <Trophy className="h-4 w-4 text-muted-foreground" />
                Instance
              </label>
              <select
                value={draft.instance}
                onChange={(e) => setDraft((d) => ({ ...d, instance: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border bg-muted text-sm text-foreground"
              >
                {availableInstances.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Realm Filter */}
          {availableRealms.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium mb-3">
                <Globe className="h-4 w-4 text-muted-foreground" />
                Realm
              </label>
              <MultiSelectDropdown
                options={availableRealms}
                selected={draft.realms}
                onChange={(realms) => setDraft((d) => ({ ...d, realms }))}
                placeholder="All Realms"
              />
            </div>
          )}

          {/* Player Count Range */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium mb-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              Player Count
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={40}
                placeholder="Min"
                value={draft.minPlayers}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minPlayers: e.target.value }))
                }
                className="w-16 px-3 py-2 rounded-lg border bg-muted text-sm text-foreground placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <input
                type="number"
                min={1}
                max={40}
                placeholder="Max"
                value={draft.maxPlayers}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, maxPlayers: e.target.value }))
                }
                className="w-16 px-3 py-2 rounded-lg border bg-muted text-sm text-foreground placeholder:text-muted-foreground [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-5 py-4 border-t">
          {hasFilters && (
            <button
              onClick={handleReset}
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleApply}
            className="ml-auto px-6 py-2 rounded-lg text-sm font-medium bg-[#5F8FA6] text-white hover:bg-[#5F8FA6]/90 transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000)
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}

function InstanceCard({ board, timing, onSelect }: { board: SpeedrunInstanceBoard; timing: SpeedrunTimingMode; onSelect: (board: SpeedrunInstanceBoard) => void }) {
  const name = board.instance_name
  const bg = getInstanceBackground(name)
  const { data: entries } = useSpeedrunLeaderboard(name, [], "", "", "", board.difficulty_name, timing)
  const top3 = entries?.slice(0, 3) ?? []

  return (
    <button
      type="button"
      onClick={() => onSelect(board)}
      className="group relative overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-white/20 hover:shadow-lg aspect-[16/7] w-full"
    >
      <img
        src={bg}
        alt={name}
        className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      <div className="relative flex h-full flex-col justify-end p-4">
        <div className="mb-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {getInstanceConfig(name)?.abbrev ?? ""}
          </span>
          <h3 className="text-lg font-bold leading-tight text-white">{boardTitle(name, board.difficulty_name)}</h3>
        </div>

        {top3.length > 0 && (
          <div className="mb-2 space-y-0.5">
            {top3.map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ["#FFD700", "#C0C0C0", "#CD7F32"][i] }}
                />
                <span className="truncate text-foreground/90">{entry.guild_name}</span>
                <span className="ml-auto font-mono font-semibold text-foreground/80">
                  {formatDuration(entry.duration_ms)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function InstanceBrowser({
  boards,
  timing,
  onTimingChange,
  onSelect,
}: {
  boards: SpeedrunInstanceBoard[]
  timing: SpeedrunTimingMode
  onTimingChange: (timing: SpeedrunTimingMode) => void
  onSelect: (board: SpeedrunInstanceBoard) => void
}) {
  const { data: supportedInstances } = useSupportedInstances()
  const raids = boards.filter((b) => getInstanceCategory(b.instance_name, supportedInstances) === "raid")
  const dungeons = boards.filter((b) => getInstanceCategory(b.instance_name, supportedInstances) !== "raid")

  if (boards.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        No speedrun data yet.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {raids.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
              <span className="text-sm text-muted-foreground/60">Chronicle of fastest guild clears</span>
            </div>
            <SpeedrunTimingToggle value={timing} onChange={onTimingChange} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {raids.map((board) => (
              <InstanceCard key={`${board.instance_name}-${board.difficulty_name}`} board={board} timing={timing} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
      {dungeons.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Dungeons</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {dungeons.map((board) => (
              <InstanceCard key={`${board.instance_name}-${board.difficulty_name}`} board={board} timing={timing} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function SpeedrunLeaderboard({ overrideInstance }: { overrideInstance?: string } = {}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: boards, isLoading: instancesLoading } = useSpeedrunBoards()
  const { data: realms } = useSpeedrunRealms()
  const [criteriaOpen, setCriteriaOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [storedTiming, setStoredTiming] = useLocalStorage<SpeedrunTimingMode>(SPEEDRUN_TIMING_STORAGE_KEY, "full")

  const selectedInstance = overrideInstance || searchParams.get("instance") || ""
  const { data: rulesData } = useSpeedrunRules(selectedInstance)
  const selectedRealms = searchParams.getAll("realm")
  const minPlayers = searchParams.get("min_players") || ""
  const maxPlayers = searchParams.get("max_players") || ""
  const sinceDays = searchParams.get("since_days") || ""
  const selectedTiming = resolveSpeedrunTimingMode(searchParams.get("timing"), storedTiming)

  // Each difficulty has its own board. Default to the first available
  // difficulty; note the URL value may legitimately be "" (no recorded
  // difficulty), so check presence rather than truthiness.
  const { data: difficulties } = useSpeedrunDifficulties(selectedInstance)
  const selectedDifficulty = searchParams.has("difficulty")
    ? (searchParams.get("difficulty") ?? "")
    : (difficulties?.[0] ?? null)

  const { data: entries, isLoading: entriesLoading } = useSpeedrunLeaderboard(
    selectedInstance,
    selectedRealms,
    minPlayers,
    maxPlayers,
    sinceDays,
    selectedDifficulty,
    selectedTiming
  )

  const setDifficulty = (difficulty: string) => {
    const next = new URLSearchParams(searchParams)
    next.set("difficulty", difficulty)
    setSearchParams(next)
  }

  const activeFilterCount =
    (selectedRealms.length > 0 ? 1 : 0) +
    (minPlayers ? 1 : 0) +
    (maxPlayers ? 1 : 0)

  const setTiming = (timing: SpeedrunTimingMode) => {
    setStoredTiming(timing)
    const next = new URLSearchParams(searchParams)
    if (timing === "full") {
      next.delete("timing")
    } else {
      next.set("timing", timing)
    }
    setSearchParams(next)
  }

  const setSinceDays = (days: string) => {
    const next = new URLSearchParams(searchParams)
    if (days) {
      next.set("since_days", days)
    } else {
      next.delete("since_days")
    }
    setSearchParams(next)
  }

  const applyCriteria = (state: CriteriaState) => {
    const next = new URLSearchParams()
    if (state.instance) next.set("instance", state.instance)
    for (const r of state.realms) next.append("realm", r)
    if (state.minPlayers) next.set("min_players", state.minPlayers)
    if (state.maxPlayers) next.set("max_players", state.maxPlayers)
    if (sinceDays) next.set("since_days", sinceDays)
    if (selectedTiming === "ranked") next.set("timing", selectedTiming)
    // Preserve the difficulty board only when staying on the same instance;
    // difficulties differ per instance.
    if (state.instance === selectedInstance && searchParams.has("difficulty")) {
      next.set("difficulty", searchParams.get("difficulty") ?? "")
    }
    setSearchParams(next)
  }

  // Distinct instance names for the criteria modal (boards are per-difficulty).
  const instanceNames = [...new Set((boards ?? []).map((b) => b.instance_name))]

  const top3 = entries?.slice(0, 3) ?? []
  const rest = entries?.slice(3) ?? []

  const bgImage = selectedInstance ? getInstanceConfig(selectedInstance)?.background : undefined

  // Landing view: show all instances grouped by raid/dungeon
  if (!selectedInstance && !instancesLoading) {
    return (
      <div className="w-full">
        <InstanceBrowser
          boards={boards ?? []}
          timing={selectedTiming}
          onTimingChange={setTiming}
          onSelect={(board) => setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set("instance", board.instance_name)
            next.set("difficulty", board.difficulty_name)
            return next
          })}
        />
      </div>
    )
  }

  // Loading state
  if (instancesLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section
        className="relative bg-cover bg-center bg-no-repeat"
        style={bgImage ? { backgroundImage: `url('${bgImage}')` } : undefined}
      >
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-background/85" />

        <div className="relative px-4 md:px-6 pt-6 md:pt-8 pb-6">
          {/* Back to all leaderboards */}
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams)
              next.delete("instance")
              next.delete("difficulty")
              setSearchParams(next)
            }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All Leaderboards
          </button>



          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="flex-1 min-w-0">
              {instancesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading...
                </div>
              ) : selectedInstance ? (
                <span className="flex items-center gap-2 text-xl md:text-3xl font-bold truncate">
                  {selectedInstance}
                  {selectedDifficulty && (
                    <span className="text-base md:text-xl font-normal text-muted-foreground">{selectedDifficulty}</span>
                  )}
                  {rulesData && (
                    <button
                      onClick={() => setRulesOpen(true)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      title="Speedrun rules"
                    >
                      <Info className="h-4 w-4 md:h-5 md:w-5" />
                    </button>
                  )}
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">No speedrun data yet</span>
              )}
            </div>

            <SpeedrunTimingToggle value={selectedTiming} onChange={setTiming} />

            {/* Time Range */}
            <div className="flex rounded-lg border border-white/10 overflow-hidden shrink-0">
              {([
                { label: "30d", value: "30" },
                { label: "90d", value: "90" },
                { label: "All", value: "" },
              ] as const).map(({ label, value }) => (
                <button
                  key={label}
                  onClick={() => setSinceDays(value)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    sinceDays === value
                      ? "bg-[#5F8FA6] text-white"
                      : "bg-black/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Criteria Button */}
            <button
              onClick={() => setCriteriaOpen(true)}
              className="relative flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium leading-5 border border-white/10 bg-black/30 text-muted-foreground hover:bg-black/40 hover:text-foreground transition-colors shrink-0"
            >
              <SlidersHorizontal className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Criteria</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-[#5F8FA6] text-white text-[10px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Difficulty Boards — each difficulty has its own leaderboard */}
          {difficulties && difficulties.length > 1 && (
            <div className="flex rounded-lg border border-white/10 overflow-hidden w-fit mb-6">
              {difficulties.map((difficulty) => (
                <button
                  key={difficulty}
                  onClick={() => setDifficulty(difficulty)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    selectedDifficulty === difficulty
                      ? "bg-[#5F8FA6] text-white"
                      : "bg-black/30 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {difficultyLabel(difficulty)}
                </button>
              ))}
            </div>
          )}

          {/* Desktop Podium */}
          {!entriesLoading && entries && entries.length > 0 && (
            <div className="hidden md:block">
              <Podium entries={top3} instanceName={selectedInstance} />
            </div>
          )}

          {entriesLoading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </section>

      <CriteriaModal
        open={criteriaOpen}
        onClose={() => setCriteriaOpen(false)}
        availableInstances={instanceNames}
        availableRealms={realms ?? []}
        initial={{ instance: selectedInstance, realms: selectedRealms, minPlayers, maxPlayers }}
        onApply={applyCriteria}
      />

      {/* Table Section */}
      <RulesModal
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        instanceName={selectedInstance}
        rules={rulesData}
      />


      <div className="px-0 md:px-6 py-4 md:py-6">
        {!entriesLoading && entries && entries.length > 0 ? (
          <>
            <LeaderboardTable entries={entries} startRank={1} className="md:hidden" />
            {rest.length > 0 && <LeaderboardTable entries={rest} startRank={4} className="hidden md:flex md:flex-col" />}
          </>
        ) : !entriesLoading && selectedInstance ? (
          <div className="text-center py-20 text-muted-foreground">
            No qualified runs for {selectedInstance} yet.
          </div>
        ) : null}
      </div>
    </div>
  )
}
