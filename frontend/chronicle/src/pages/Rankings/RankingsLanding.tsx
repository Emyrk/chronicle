import { useSearchParams } from "react-router-dom"
import { Skull, Loader2 } from "lucide-react"
import { CLASS_CSS_VAR } from "./classDisplay"
import { useRankingsInstances } from "@/api/rankingsQueries"
import { getInstanceCategory } from "@/pages/Logs/utils/instanceCategory"
import {
  compareByRaidProgression,
  groupByRaidLevel,
} from "@/pages/Logs/utils/instanceProgressionOrder"
import { useSupportedInstances } from "@/api/queries"
import type { RankingsInstanceSummary } from "@/api/typesGenerated"
import { rankingsSummariesWithStats } from "./rankingsLandingState"
import { InstanceCard } from "./InstanceCard"

/** Instance picker. `showTopPlayers` lists each raid's top DPS on its card. */
export function RankingsLanding({ showTopPlayers = true }: { showTopPlayers?: boolean }) {
  const [params] = useSearchParams()
  const { data: summaries, isLoading } = useRankingsInstances()
  const { data: supportedInstances } = useSupportedInstances()

  const instanceHref = (name: string, difficultyName?: string) => {
    const next = new URLSearchParams(params)
    next.set("instance", name)
    if (difficultyName) {
      next.set("diff", difficultyName)
    } else {
      next.delete("diff")
    }
    return `?${next.toString()}`
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const visibleSummaries = rankingsSummariesWithStats(summaries)

  if (visibleSummaries.length === 0) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border p-8 text-center text-muted-foreground">
          No rankings data yet.
        </div>
      </div>
    )
  }

  const raids = visibleSummaries
    .filter((s) => getInstanceCategory(s.instance_name, supportedInstances) === "raid")
    .sort((left, right) =>
      compareByRaidProgression(left.instance_name, right.instance_name, supportedInstances),
    )
  const raidGroups = groupByRaidLevel(
    raids,
    (raid) => raid.instance_name,
    supportedInstances,
  )
  const dungeons = visibleSummaries.filter(
    (s) => getInstanceCategory(s.instance_name, supportedInstances) !== "raid",
  )

  const renderGrid = (items: RankingsInstanceSummary[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <InstanceCard
          key={`${s.instance_name}-${s.difficulty_name}-${s.max_players}`}
          name={s.instance_name}
          to={instanceHref(s.instance_name, s.difficulty_name)}
          badge={s.difficulty_name && (
            <>
              {s.difficulty_name}
              {s.max_players > 0 && (
                <span className="text-white/50 font-normal">{s.max_players}-man</span>
              )}
            </>
          )}
        >
          {/* Top 3 */}
          {showTopPlayers && (
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
          )}

          {/* Total kills */}
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Skull className="h-3 w-3" />
            {s.total_kills.toLocaleString()} kills
          </div>
        </InstanceCard>
      ))}
    </div>
  )

  return (
    <div className="space-y-6">
      {raidGroups.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
          {raidGroups.map((group) => (
            <div key={group.level ?? "other"} className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.level ? `Level ${group.level}` : "Other"}
              </h3>
              {renderGrid(group.items)}
            </div>
          ))}
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
