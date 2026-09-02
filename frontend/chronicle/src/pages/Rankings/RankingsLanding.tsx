import { useSearchParams } from "react-router-dom"
import { Skull, Loader2 } from "lucide-react"
import { CLASS_CSS_VAR } from "./classDisplay"
import { useRankingsInstances } from "@/api/rankingsQueries"
import {
  getInstanceBackground,
  getInstanceAbbrev,
} from "@/pages/Logs/utils/instanceImages"
import { getInstanceCategory } from "@/pages/Logs/utils/instanceCategory"
import { useSupportedInstances } from "@/api/queries"
import type { RankingsInstanceSummary } from "@/api/typesGenerated"

export function RankingsLanding() {
  const [, setParams] = useSearchParams()
  const { data: summaries, isLoading } = useRankingsInstances()
  const { data: supportedInstances } = useSupportedInstances()

  const handleSelectInstance = (name: string, difficultyName?: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("instance", name)
      if (difficultyName) {
        next.set("diff", difficultyName)
      } else {
        next.delete("diff")
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!summaries || summaries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border p-8 text-center text-muted-foreground">
          No rankings data yet.
        </div>
      </div>
    )
  }

  const raids = summaries.filter(
    (s) => getInstanceCategory(s.instance_name, supportedInstances) === "raid",
  )
  const dungeons = summaries.filter(
    (s) => getInstanceCategory(s.instance_name, supportedInstances) !== "raid",
  )

  const renderGrid = (items: RankingsInstanceSummary[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <button
          key={`${s.instance_name}-${s.difficulty_name}-${s.max_players}`}
          onClick={() => handleSelectInstance(s.instance_name, s.difficulty_name)}
          className="group relative overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-white/20 hover:shadow-lg aspect-[16/7]"
        >
          {/* Background image */}
          <img
            src={getInstanceBackground(s.instance_name)}
            alt={s.instance_name}
            className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

          {/* Difficulty badge — top-right corner */}
          {s.difficulty_name && (
            <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/10">
              {s.difficulty_name}
              {s.max_players > 0 && (
                <span className="text-white/50 font-normal">{s.max_players}-man</span>
              )}
            </div>
          )}

          {/* Content */}
          <div className="relative flex h-full flex-col justify-end p-4">
            {/* Title + abbrev */}
            <div className="mb-2">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {getInstanceAbbrev(s.instance_name)}
              </span>
              <h2 className="text-lg font-bold leading-tight">{s.instance_name}</h2>
            </div>

            {/* Top 3 */}
            <div className="mb-2 space-y-0.5">
              {s.top_players.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: CLASS_CSS_VAR[p.player_class] }}
                  />
                  <span className="truncate text-foreground/90">{p.player_name}</span>
                  <span className="ml-auto font-mono font-semibold text-foreground/80">
                    {Math.round(p.dps).toLocaleString()} dps
                  </span>
                </div>
              ))}
            </div>

            {/* Total kills */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Skull className="h-3 w-3" />
              {s.total_kills.toLocaleString()} kills
            </div>
          </div>
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      {raids.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
          {renderGrid(raids)}
        </section>
      )}

      {dungeons.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Dungeons</h2>
          {renderGrid(dungeons)}
        </section>
      )}
    </div>
  )
}
