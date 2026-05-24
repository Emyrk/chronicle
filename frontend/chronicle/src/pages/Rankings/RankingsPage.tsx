import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import type { WoWHeroClasses } from "@/api/typesGenerated"
import { type MetricType, getBossInfo } from "./mockData"
import type { TimePeriod } from "./timePeriod"
import { BossBrowser } from "./BossBrowser"
import { RankingsView } from "./RankingsView"

const VALID_METRICS = new Set<MetricType>(["dps", "hps", "damage_done", "healing_done", "dispels", "interrupts"])
const VALID_PERIODS = new Set<TimePeriod>(["all", "90d", "30d", "7d"])

export function RankingsPage() {
  const [params, setParams] = useSearchParams()

  // ── URL state ────────────────────────────────────────────────────────

  const bossId = params.get("boss") ?? ""
  const bossInfo = useMemo(() => (bossId ? getBossInfo(bossId) : undefined), [bossId])

  const metric: MetricType = useMemo(() => {
    const raw = params.get("metric")
    return raw && VALID_METRICS.has(raw as MetricType) ? (raw as MetricType) : "dps"
  }, [params])

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
      next.delete("boss")
      return next
    })
  }, [setParams])

  const handleMetricChange = useCallback(
    (m: MetricType) => setParam("metric", m === "dps" ? null : m),
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
          metric={metric}
          onMetricChange={handleMetricChange}
          selectedClasses={selectedClasses}
          onToggleClass={handleToggleClass}
          timePeriod={timePeriod}
          onTimePeriodChange={handleTimePeriodChange}
          onBack={handleBack}
        />
      ) : (
        <BossBrowser onSelectBoss={handleSelectBoss} />
      )}
    </div>
  )
}
