import { Loader2, Swords, Timer } from "lucide-react"
import { useSupportedInstances } from "@/api/queries"
import { getInstanceCategory } from "@/pages/Logs/utils/instanceCategory"
import { groupByRaidLevel } from "@/pages/Logs/utils/instanceProgressionOrder"
import { InstanceCard } from "../Rankings/InstanceCard"
import { rulesetEntries, type RulesetEntry } from "./damageRuleRows"

export function RulesetsLanding() {
  const { data, isLoading, isError } = useSupportedInstances()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (isError) {
    return <p className="py-12 text-center text-muted-foreground">Could not load rulesets. Please try again later.</p>
  }

  const instances = rulesetEntries(data ?? [])
  if (instances.length === 0) {
    return (
      <div className="rounded-xl border p-8 text-center text-muted-foreground">
        No DPS or speedrun rulesets are available.
      </div>
    )
  }

  // rulesetEntries already sorts by raid progression.
  const raidGroups = groupByRaidLevel(
    instances.filter((entry) => getInstanceCategory(entry.name, data) === "raid"),
    (entry) => entry.name,
    data,
  )
  const dungeons = instances.filter((entry) => getInstanceCategory(entry.name, data) !== "raid")

  const renderGrid = (items: RulesetEntry[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((entry) => {
        const requirementCount = entry.speedrunRules?.requirements.length ?? 0
        return (
          <InstanceCard
            key={entry.name}
            name={entry.name}
            to={`/leaderboards/ruleset?instance=${encodeURIComponent(entry.name)}`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              {entry.speedrunRules && (
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" />
                  {requirementCount} speedrun {requirementCount === 1 ? "requirement" : "requirements"}
                </span>
              )}
              {entry.damageRuleCount > 0 && (
                <span className="flex items-center gap-1">
                  <Swords className="h-3 w-3" />
                  {entry.damageRuleCount} DPS target {entry.damageRuleCount === 1 ? "rule" : "rules"}
                </span>
              )}
            </div>
          </InstanceCard>
        )
      })}
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
