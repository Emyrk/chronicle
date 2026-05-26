import { useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { Trophy, Skull } from "lucide-react"
import { getInstanceSummaries, CLASS_CSS_VAR } from "./mockData"
import {
  getInstanceBackground,
  getInstanceAbbrev,
} from "@/pages/Logs/utils/instanceImages"

export function RankingsLanding() {
  const [, setParams] = useSearchParams()
  const summaries = useMemo(() => getInstanceSummaries(), [])

  const handleSelectInstance = (name: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("instance", name)
      return next
    })
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
            key={s.instanceName}
            onClick={() => handleSelectInstance(s.instanceName)}
            className="group relative overflow-hidden rounded-xl border bg-card text-left transition-all hover:border-white/20 hover:shadow-lg aspect-[16/7]"
          >
            {/* Background image */}
            <img
              src={getInstanceBackground(s.instanceName)}
              alt={s.instanceName}
              className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />

            {/* Content */}
            <div className="relative flex h-full flex-col justify-end p-4">
              {/* Title + abbrev */}
              <div className="mb-2">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {getInstanceAbbrev(s.instanceName)}
                </span>
                <h2 className="text-lg font-bold leading-tight">{s.instanceName}</h2>
              </div>

              {/* Top 3 */}
              <div className="mb-2 space-y-0.5">
                {s.topPlayers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: CLASS_CSS_VAR[p.className] }}
                    />
                    <span className="truncate text-foreground/90">{p.name}</span>
                    <span className="ml-auto font-mono font-semibold text-foreground/80">
                      {p.dps.toLocaleString()}/s
                    </span>
                  </div>
                ))}
              </div>

              {/* Total kills */}
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Skull className="h-3 w-3" />
                {s.totalKills.toLocaleString()} kills
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
