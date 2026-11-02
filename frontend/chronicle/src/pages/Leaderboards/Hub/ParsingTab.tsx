import { useState } from "react"
import { BarChart3, Timer, UserRound, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { SpecView } from "@/pages/Leaderboards/Parsing/SpecView"
import { SpreadsView } from "@/pages/Leaderboards/Parsing/SpreadsView"
import { KillTimesView } from "@/pages/Leaderboards/Parsing/KillTimesView"
import type { RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import type { EncounterSelection } from "./encounterSelection"
import { MOCK_SPREAD_DIFFICULTY, parseSpreads, timeParseSpreads, type HubRole, type HubSubject } from "./hub.fixtures"

const NO_HIDDEN: ReadonlySet<string> = new Set()

type ParsingView = "spreads" | "spec" | "times"
const PARSING_VIEWS: { id: ParsingView; label: string; icon: LucideIcon }[] = [
  { id: "spreads", label: "All specs", icon: BarChart3 },
  { id: "spec", label: "Spec details", icon: UserRound },
  { id: "times", label: "Kill times", icon: Timer },
]

/**
 * What each parse takes: today's parsing views and their switch (All specs bar chart, Spec details,
 * Kill times), filtered by the hub instead of their own pickers. Guilds see kill-time parses.
 * Parses are per boss, so a full clear or a set shows the first boss and says so.
 */
export function ParsingTab({
  instanceName,
  allBosses,
  selection,
  scope,
  role,
  subject,
  onBoss,
  onClear,
  onScope,
}: {
  instanceName: string
  allBosses: readonly string[]
  selection: EncounterSelection
  scope: RatingScope
  role: HubRole
  subject: HubSubject
  onBoss: (boss: string) => void
  onClear: () => void
  onScope: (scope: RatingScope) => void
}) {
  const [showOffRole, setShowOffRole] = useState(false)
  const metric = role === "dps" ? "dps" : "hps"
  const chosen = selection.kind === "bosses" ? selection.bosses : []
  const boss = chosen[0] ?? allBosses[0]

  // Picking a spec in the hub opens its detail; the switch can still go back to the bar chart.
  const [view, setView] = useState<ParsingView>(scope.spec ? "spec" : "spreads")

  const killTimes = (
    <KillTimesView
      instanceName={instanceName}
      bosses={allBosses}
      boss={boss}
      showClear={selection.kind === "clear"}
      spreads={timeParseSpreads(instanceName, allBosses)}
      difficulty={MOCK_SPREAD_DIFFICULTY}
      loading={false}
      onSelectBoss={onBoss}
      onSelectClear={onClear}
    />
  )

  // A guild's parse is its run time; the spec views have nothing to say about guilds.
  if (subject === "guilds") return killTimes

  return (
    <div className="space-y-5">
      {/* Today's parsing view switch, in the statistics sub-tab style. Class and spec come from the hub picker. */}
      <nav className="flex overflow-x-auto rounded-xl border bg-card px-2 sm:px-4" aria-label="Parsing view">
        {PARSING_VIEWS.map((v) => (
          <button
            key={v.id}
            type="button"
            aria-pressed={v.id === view}
            onClick={() => setView(v.id)}
            className={cn(
              "flex shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
              v.id === view
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
            )}
          >
            <v.icon className={cn("size-4", v.id === view && "text-primary")} />
            {v.label}
          </button>
        ))}
      </nav>

      {view === "times" ? (
        killTimes
      ) : view === "spec" ? (
        // One spec's detail on the boss and its cutoffs on every boss; without a spec, a spec picker.
        <SpecView
          instanceName={instanceName}
          bosses={allBosses}
          boss={boss}
          bossSpreads={parseSpreads(metric, [boss])}
          metric={metric}
          difficulty={MOCK_SPREAD_DIFFICULTY}
          cohortMode="spec"
          hideClassFilter
          playerClass={scope.cls ?? ""}
          playerSpec={scope.spec ?? ""}
          playerSubSpec={scope.subSpec ?? ""}
          onSelectBoss={onBoss}
          onSelectSpec={(changes) =>
            onScope({
              boss: scope.boss,
              cls: changes.class ?? scope.cls,
              spec: changes.spec ?? scope.spec,
              subSpec: changes.sub_spec || undefined,
            })
          }
        />
      ) : (
        <div className="space-y-3">
          {chosen.length !== 1 && (
            <p className="px-1 text-xs text-muted-foreground">
              Parses are per boss: showing <span className="text-foreground">{boss}</span>. Pick a boss in the encounter list for another.
            </p>
          )}
          <SpreadsView
            spreads={parseSpreads(metric, [boss], scope.cls)}
            hidden={NO_HIDDEN}
            metricLabel={metric.toUpperCase()}
            loading={false}
            showOffRole={showOffRole}
            onShowOffRoleChange={setShowOffRole}
            onHiddenChange={() => {}}
            hideClassChips
            onOpenSpec={(sp) => {
              // A row opens that spec's detail.
              onScope({ boss: scope.boss, cls: sp.player_class, spec: sp.player_spec, subSpec: sp.player_sub_spec || undefined })
              setView("spec")
            }}
          />
        </div>
      )}
    </div>
  )
}
