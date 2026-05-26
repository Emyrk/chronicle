import { useSearchParams } from "react-router-dom"
import { Trophy, Skull, Loader2 } from "lucide-react"
import { CLASS_CSS_VAR } from "./classDisplay"
import { useRankingsInstances } from "@/api/rankingsQueries"
import {
  getInstanceBackground,
  getInstanceAbbrev,
} from "@/pages/Logs/utils/instanceImages"

export function RankingsLanding() {
  const [, setParams] = useSearchParams()
  const { data: summaries, isLoading } = useRankingsInstances()

  const handleSelectInstance = (name: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("instance", name)
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
        <div className="flex items-center gap-2">
          <Trophy className="h-6 w-6 text-[#5F8FA6]" />
          <h1 className="text-2xl font-bold">Rankings</h1>
        </div>
        <div className="rounded-xl border p-8 text-center text-muted-foreground">
          No rankings data yet.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Trophy className="h-6 w-6 text-[#5F8FA6]" />
        <h1 className="text-2xl font-bold">Rankings</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summaries.map((s) => (
          <button
            key={s.instance_name}
            onClick={() => handleSelectInstance(s.instance_name)}
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
                      {Math.round(p.dps).toLocaleString()}/s
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
    </div>
  )
}
