import { Activity, BarChart3, ChartNoAxesGantt, type LucideIcon } from "lucide-react"
import type { RankingsBoxPlotStats, RankingsKillTimeStats, RankingsSuccessRate } from "@/api/typesGenerated"
import { cn } from "@/lib/utils"
import { BoxPlotChart } from "@/pages/Rankings/BoxPlotChart"
import { CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { KillTimeContent, SuccessRateContent } from "@/pages/Rankings/InstanceView"
import type { RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { boxPlotStats, clearTimeStats, killTimeStats, successRates, type HubRole } from "./hub.fixtures"
import type { EncounterSelection } from "./encounterSelection"

export type StatisticsView = "specs" | "killtimes" | "success"

const VIEWS: { id: StatisticsView; label: string; icon: LucideIcon }[] = [
  { id: "specs", label: "By spec", icon: ChartNoAxesGantt },
  { id: "killtimes", label: "Kill times", icon: BarChart3 },
  { id: "success", label: "Success rate", icon: Activity },
]

type LiveResult<T> = { status: "loading" | "error" } | { status: "ready"; data: T }

/** Parent supplies API results for the selected population; omitted panels are unavailable. */
export interface LiveStatisticsData {
  specs?: LiveResult<RankingsBoxPlotStats[]>
  clearTimes?: LiveResult<RankingsKillTimeStats[]>
  killTimes?: LiveResult<RankingsKillTimeStats[]>
  successRates?: LiveResult<RankingsSuccessRate[]>
}

function liveState<T>(result: LiveResult<T> | undefined, label: string) {
  if (!result) return <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">{label} unavailable for this selection.</p>
  if (result.status === "loading") return <p role="status" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Loading {label.toLowerCase()}…</p>
  if (result.status === "error") return <p role="alert" className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Could not load {label.toLowerCase()}.</p>
  return null
}

/**
 * Instance data: how fast and how reliably the raid goes down. Speedruns rank
 * guilds; the other views are distributions over everyone's runs. Kill-time
 * and success-rate panels are the statistics leaderboard's own components.
 */
export function StatisticsTab({
  instanceName,
  bosses,
  optional,
  selection,
  view,
  onView,
  scope,
  role,
  onScope,
  live,
}: {
  instanceName: string
  bosses: readonly string[]
  optional: ReadonlySet<string>
  selection: EncounterSelection
  view: StatisticsView
  onView: (view: StatisticsView) => void
  scope: RatingScope
  role: HubRole
  onScope: (scope: RatingScope) => void
  live?: LiveStatisticsData
}) {
  const unit = role === "dps" ? "DPS" : "HPS"
  // Full clear covers every boss for per-boss panels; required ones first, optional after.
  const ordered = [...bosses.filter((b) => !optional.has(b)), ...bosses.filter((b) => optional.has(b))]
  const chosen = selection.kind === "clear" ? ordered : selection.bosses

  return (
    <div className="space-y-5">
      <nav className="flex overflow-x-auto rounded-xl border bg-card px-2 sm:px-4" aria-label="Statistics view">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={v.id === view}
            onClick={() => onView(v.id)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
              v.id === view
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
            )}
          >
            <v.icon className={cn("size-4", v.id === view && "text-primary")} />
            {v.id === "specs" ? `${unit} by spec` : v.label}
          </button>
        ))}
      </nav>

      {view === "specs" && (live && live.specs?.status !== "ready" ? liveState(live.specs, "Spec distributions") : (
        // The overview's spec cards, full size: every spec in the role, the chosen class lit.
        <BoxPlotChart
          stats={live ? (live.specs?.status === "ready" ? live.specs.data : []) : boxPlotStats(scope.boss, role)}
          title={`${unit} distribution by spec · ${scope.boss ?? instanceName}`}
          subtitle={
            scope.cls
              ? `${scope.spec ? `${scope.spec} ` : ""}${CLASS_DISPLAY[scope.cls]} highlighted · click a spec to narrow to it`
              : `Each run's ${unit}, per spec · click a spec to narrow to it`
          }
          highlight={
            scope.cls
              ? (s) =>
                  s.player_class === scope.cls &&
                  (!scope.spec || s.player_spec === scope.spec) &&
                  (!scope.subSpec || s.player_sub_spec === scope.subSpec)
              : undefined
          }
          onRowClick={(cls, spec, subSpec) => onScope({ boss: scope.boss, cls, spec, subSpec: subSpec || undefined })}
        />
      ))}
      {view === "killtimes" && (
        // As on today's board: the full-clear box sits on top, per-boss kill times below.
        <div className="space-y-4">
          {live && live.clearTimes?.status !== "ready" ? liveState(live.clearTimes, "Full clear times") :
            <KillTimeContent stats={live ? (live.clearTimes?.status === "ready" ? live.clearTimes.data : []) : clearTimeStats(instanceName)} loading={false} title="Full Clear Time" unit="clears" trimOutliers />}
          {live && live.killTimes?.status !== "ready" ? liveState(live.killTimes, "Boss kill times") :
            <KillTimeContent stats={live ? (live.killTimes?.status === "ready" ? live.killTimes.data.filter((row) => chosen.includes(row.encounter_name)) : []) : killTimeStats(chosen, bosses)} loading={false} instanceName={instanceName} />}
        </div>
      )}
      {view === "success" && (live && live.successRates?.status !== "ready" ? liveState(live.successRates, "Success rates") :
        <SuccessRateContent rates={live ? (live.successRates?.status === "ready" ? live.successRates.data.filter((row) => chosen.includes(row.encounter_name)) : []) : successRates(chosen, bosses)} loading={false} instanceName={instanceName} />)}
    </div>
  )
}
