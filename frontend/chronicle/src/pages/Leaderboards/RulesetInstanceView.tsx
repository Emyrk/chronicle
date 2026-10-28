import type { ReactNode } from "react"
import { ArrowLeft, Info, Loader2, Swords, Timer } from "lucide-react"
import { Link } from "react-router-dom"
import { useSupportedInstances } from "@/api/queries"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { damageRuleRows, rulesetEntries } from "./damageRuleRows"
import { SpeedrunRequirements } from "./SpeedrunRequirements"

function RulesSection({ id, icon, title, description, children }: {
  id: string
  icon: ReactNode
  title: string
  description: ReactNode
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3 sm:px-5">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">
          {icon}
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function RulesetInstanceView({ instanceName }: { instanceName: string }) {
  const { data, isLoading, isError } = useSupportedInstances()
  const entry = rulesetEntries(data ?? []).find((item) => item.name === instanceName)
  const instance = entry?.instance ?? data?.find((item) => item.name === instanceName)
  const rows = instance && !entry?.derived ? damageRuleRows(instance) : []

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
        </div>
      </div>

      {entry?.speedrunRules ? (
        <RulesSection
          id="speedrun-requirements"
          icon={<Timer className="h-4 w-4 text-muted-foreground" />}
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
          icon={<Swords className="h-4 w-4 text-muted-foreground" />}
          title="DPS ranking targets"
          description={<>
            Rankings count effective damage (damage minus overkill, plus absorbed) to eligible targets.
            Encounters not listed count all eligible hostile damage, including trash.
          </>}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No encounter-specific target restrictions. All eligible hostile damage counts.</p>
          ) : (
            <div className="styled-scrollbar -mx-4 overflow-x-auto sm:-mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 pb-2 font-semibold sm:px-5">Encounter</th>
                    <th className="px-4 pb-2 font-semibold sm:px-5">Counted damage</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                      <td className="whitespace-nowrap px-4 py-2.5 align-top font-medium sm:px-5">{row.name}</td>
                      <td className="px-4 py-2 sm:px-5">
                        {row.mode === "entries" ? (
                          <ul className="flex flex-wrap gap-1.5" aria-label={`${row.name} ranked targets`}>
                            {row.targets.map((target) => (
                              <li
                                key={target.id}
                                className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs"
                                title={`Creature ID ${target.id}`}
                              >
                                {target.name}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted-foreground">
                            {row.mode === "boss-only" ? "Boss targets only" : "All eligible hostile damage"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 flex gap-2 rounded-lg bg-muted/30 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Damage Done shows raw damage by default. Turn on Ranked to see ranking-eligible damage; overkill and
              damage to excluded targets move to Excluded. Hit counts, crit rate, and hit sizes still reflect the original hits.
            </span>
          </p>
        </RulesSection>
      )}
    </div>
  )
}
