import type { ReactNode } from "react"
import { ArrowLeft, Clock, Info, Loader2, Skull, Swords, Timer, Users } from "lucide-react"
import { Link } from "react-router-dom"
import { useSupportedInstances } from "@/api/queries"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { cn } from "@/lib/utils"
import { damageRuleRows, formatLevelRange, rulesetEntries, type RankedTime } from "./damageRuleRows"
import { SpeedrunRequirements } from "./SpeedrunRequirements"

function RulesSection({ id, icon, iconClassName, title, description, aside, children }: {
  id: string
  icon: ReactNode
  iconClassName: string
  title: string
  description: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClassName)}>{icon}</div>
          <div className="min-w-0">
            <h2 id={id} className="text-base font-semibold">{title}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {aside}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

const TARGET_CHIP = {
  boss: "bg-red-500/15 text-red-200 ring-red-500/30",
  add: "bg-amber-500/10 text-amber-200 ring-amber-500/25",
}

function TargetLegend() {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-400" />Boss</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" />Add</span>
    </div>
  )
}

function RankedTimeCell({ rankedTime, mode }: { rankedTime: RankedTime; mode: string }) {
  if (rankedTime === "full") {
    return <span className="whitespace-nowrap text-xs text-muted-foreground">Full encounter</span>
  }
  const targets = mode === "boss-only" ? "boss" : "target"
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"
      title={`From the first counted ${targets} engaging to the last counted ${targets} dying`}
    >
      <Clock className="h-3 w-3 text-emerald-300" />
      First engage → last {targets} death
    </span>
  )
}

export function RulesetInstanceView({ instanceName }: { instanceName: string }) {
  const { data, isLoading, isError } = useSupportedInstances()
  const entry = rulesetEntries(data ?? []).find((item) => item.name === instanceName)
  const instance = entry?.instance ?? data?.find((item) => item.name === instanceName)
  const rows = instance && !entry?.derived ? damageRuleRows(instance) : []
  const bossCount = entry?.speedrunRules?.requirements.filter((requirement) => requirement.category === "Bosses").length ?? 0

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (isError) return <p className="py-12 text-center text-muted-foreground">Could not load rulesets. Please try again later.</p>
  if (!instance) return <p className="py-12 text-center text-muted-foreground">No rules found for {instanceName}.</p>

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero header with instance background, matching the Statistics view */}
      <div className="relative overflow-hidden rounded-xl border">
        <div className="absolute inset-0 z-0">
          <img
            src={getInstanceBackground(instanceName)}
            alt=""
            className="h-full w-full object-cover opacity-45 sm:opacity-70"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/75 to-background/95 sm:bg-gradient-to-r sm:from-background/90 sm:via-background/70 sm:to-background/50" />
        </div>
        <div className="relative z-10 p-3 sm:p-4">
          <Link
            to="/leaderboards/rulesets"
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            All rulesets
          </Link>
          <h1 className="flex flex-wrap items-baseline gap-x-2 text-xl font-bold leading-tight sm:text-2xl">
            <span>{instanceName}</span>
            <span className="text-sm font-normal text-muted-foreground sm:text-lg">Ruleset</span>
          </h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
            {entry?.speedrunRules && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 ring-1 ring-red-500/30 backdrop-blur-sm">
                <Skull className="h-3 w-3 text-red-300" />
                {bossCount} required {bossCount === 1 ? "boss" : "bosses"}
              </span>
            )}
            {entry?.speedrunRules && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 ring-1 ring-sky-500/30 backdrop-blur-sm">
                <Users className="h-3 w-3 text-sky-300" />
                {entry.speedrunRules.level_range ? `Level ${formatLevelRange(entry.speedrunRules.level_range)}` : "Any level"}
              </span>
            )}
            {rows.length > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 ring-1 ring-[color:var(--tertiary)]/40 backdrop-blur-sm">
                <Swords className="h-3 w-3 text-[color:var(--tertiary)]" />
                {rows.length} DPS target {rows.length === 1 ? "rule" : "rules"}
              </span>
            )}
          </div>
        </div>
      </div>

      {entry?.speedrunRules ? (
        <RulesSection
          id="speedrun-requirements"
          icon={<Timer className="h-4 w-4" />}
          iconClassName="bg-emerald-500/15 text-emerald-300"
          title="Speedrun requirements"
          description="Every listed kill is required for a qualifying clear."
        >
          <SpeedrunRequirements rules={entry.speedrunRules} />
        </RulesSection>
      ) : (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground sm:p-5">
          No speedrun rules for {instanceName}.
        </div>
      )}

      {!entry?.derived && (
        <RulesSection
          id="damage-targets"
          icon={<Swords className="h-4 w-4" />}
          iconClassName="bg-[color:var(--tertiary)]/15 text-[color:var(--tertiary)]"
          aside={rows.length > 0 && <TargetLegend />}
          title="DPS ranking targets"
          description={<>
            Rankings count effective damage (damage minus overkill, plus absorbed) to eligible targets.
            Encounters not listed count all eligible hostile damage, including trash, over the full encounter.
          </>}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No encounter-specific target restrictions. All eligible hostile damage counts.</p>
          ) : (
            <div className="styled-scrollbar -mx-4 -mt-4 overflow-x-auto sm:-mx-5 sm:-mt-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2 font-semibold sm:px-5">Encounter</th>
                    <th className="px-4 py-2 font-semibold sm:px-5">Counted damage</th>
                    <th className="px-4 py-2 font-semibold sm:px-5">Ranked time</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name} className="border-b border-border/50 transition-colors last:border-0 odd:bg-muted/10 hover:bg-muted/30">
                      <td className="whitespace-nowrap px-4 py-2.5 align-top font-semibold sm:px-5">
                        <span className="flex items-center gap-2">
                          <Skull className="h-3.5 w-3.5 text-red-400/80" />
                          {row.name}
                        </span>
                      </td>
                      <td className="px-4 py-2 sm:px-5">
                        {row.mode === "entries" || row.mode === "phase-kill" ? (
                          <ul className="flex flex-wrap gap-1.5" aria-label={`${row.name} ranked targets`}>
                            {row.targets.map((target) => (
                              <li
                                key={target.id}
                                className={cn("rounded-md px-2 py-0.5 text-xs font-medium ring-1", target.boss ? TARGET_CHIP.boss : TARGET_CHIP.add)}
                                title={`${target.boss ? "Boss" : "Add"} · Creature ID ${target.id}`}
                              >
                                {target.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          row.mode === "boss-only" ? (
                            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ring-1", TARGET_CHIP.boss)}>
                              <Skull className="h-3 w-3" />
                              Boss targets only
                            </span>
                          ) : (
                            <span className="text-muted-foreground">All eligible hostile damage</span>
                          )
                        )}
                        {row.note && (
                          <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-muted-foreground">{row.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-2 align-top sm:px-5">
                        <RankedTimeCell rankedTime={row.rankedTime} mode={row.mode} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 flex gap-2 rounded-lg border border-[color:var(--tertiary)]/25 bg-[color:var(--tertiary)]/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[color:var(--tertiary)]" />
            <span>
              Damage Done shows raw damage by default. Turn on Ranked to see ranking-eligible damage; overkill and
              damage to excluded targets move to Excluded. Hit counts, crit rate, and hit sizes still reflect the original hits.
            </span>
          </p>
          {rows.some((row) => row.rankedTime === "window") && (
            <p className="mt-2 flex gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />
              <span>
                Ranked time ends when the last counted target dies, so cleanup after the kill doesn&apos;t lower DPS.
                The full encounter is used instead if a counted target survives, resets, or is engaged more than once.
                Select the encounter on a log and click Ranked under it to filter panels to this window.
              </span>
            </p>
          )}
        </RulesSection>
      )}
    </div>
  )
}
