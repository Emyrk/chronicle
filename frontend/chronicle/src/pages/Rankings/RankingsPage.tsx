import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import { getBossInfo, getInstanceByName } from "./mockData"
import type { TimePeriod } from "./timePeriod"
import { DpsOverview } from "./DpsOverview"
import { RankingsView } from "./RankingsView"
import { InstanceView } from "./InstanceView"

const VALID_PERIODS = new Set<TimePeriod>(["all", "90d", "30d", "7d"])

export function RankingsPage() {
  const [params, setParams] = useSearchParams()

  // ── URL state ────────────────────────────────────────────────────────

  const bossId = params.get("boss") ?? ""
  const bossInfo = useMemo(() => (bossId ? getBossInfo(bossId) : undefined), [bossId])

  const instance = params.get("instance")
  const viewParam = params.get("view")

  const instanceInfo = useMemo(
    () => (viewParam === "instance" && instance ? getInstanceByName(instance) : undefined),
    [viewParam, instance],
  )

  const timePeriod: TimePeriod = useMemo(() => {
    const raw = params.get("period")
    return raw && VALID_PERIODS.has(raw as TimePeriod) ? (raw as TimePeriod) : "all"
  }, [params])

  const selectedClasses: Set<WoWHeroClasses> = useMemo(() => {
    const raw = params.get("classes")
    if (!raw) return new Set<WoWHeroClasses>()
    return new Set(raw.split(",").filter(Boolean) as WoWHeroClasses[])
  }, [params])

  // ── Setters ──────────────────────────────────────────────────────────

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value === null || value === "") {
          next.delete(key)
        } else {
          next.set(key, value)
        }
        return next
      })
    },
    [setParams],
  )

  const handleSelectBoss = useCallback(
    (id: string) => setParam("boss", id),
    [setParam],
  )

  const handleBack = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (next.has("boss")) {
        next.delete("boss")
      } else if (next.has("view")) {
        next.delete("view")
        next.delete("instance")
      }
      return next
    })
  }, [setParams])

  const handleSelectInstance = useCallback(
    (name: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set("view", "instance")
        next.set("instance", name)
        return next
      })
    },
    [setParams],
  )

  const handleInstanceBack = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete("view")
      next.delete("instance")
      return next
    })
  }, [setParams])

  const handleInstanceChange = useCallback(
    (v: string | null) => setParam("instance", v),
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
        if (current.has(cls)) {
          current.delete(cls)
        } else {
          current.add(cls)
        }
        if (current.size === 0) {
          next.delete("classes")
        } else {
          next.set("classes", [...current].join(","))
        }
        return next
      })
    },
    [setParams],
  )

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-8">
      {bossInfo ? (
        <RankingsView
          boss={bossInfo}
          selectedClasses={selectedClasses}
          onToggleClass={handleToggleClass}
          timePeriod={timePeriod}
          onTimePeriodChange={handleTimePeriodChange}
          onBack={handleBack}
        />
      ) : instanceInfo ? (
        <InstanceView
          instance={instanceInfo}
          timePeriod={timePeriod}
          onTimePeriodChange={handleTimePeriodChange}
          selectedClasses={selectedClasses}
          onToggleClass={handleToggleClass}
          onSelectBoss={handleSelectBoss}
          onBack={handleInstanceBack}
        />
      ) : (
        <DpsOverview
          instance={instance}
          onInstanceChange={handleInstanceChange}
          timePeriod={timePeriod}
          onTimePeriodChange={handleTimePeriodChange}
          selectedClasses={selectedClasses}
          onToggleClass={handleToggleClass}
          onSelectBoss={handleSelectBoss}
          onSelectInstance={handleSelectInstance}
        />
      )}
    </div>
  )
}
