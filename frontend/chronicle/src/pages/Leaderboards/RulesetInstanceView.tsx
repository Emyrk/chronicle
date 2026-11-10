import type { CSSProperties, ReactNode } from "react"
import { ArrowLeft, Clock, Info, Loader2, Skull, Swords, Timer, Users } from "lucide-react"
import { Link } from "react-router-dom"
import { useSupportedInstances } from "@/api/queries"
import type { SupportedInstanceRenownRule } from "@/api/typesGenerated"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { cn } from "@/lib/utils"
import { damageRuleRows, formatLevelRange, renownRuleRows, rulesetEntries, type RankedTime } from "./damageRuleRows"
import { SpeedrunRequirements } from "./SpeedrunRequirements"
import { METRIC_THEMES } from "./Ratings/ratingThemes"
import { awardsLabel, formatRenown, sumRenown, useRenownAwards } from "./renownConfig"

const RENOWN = METRIC_THEMES.renown

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

/** One bar in progression order; each boss's segment is sized by its share of the instance total. */
function RenownShareBar({ rules, total }: { rules: readonly SupportedInstanceRenownRule[]; total: number }) {
  const top = Math.max(...rules.map((rule) => rule.points))
  const describe = (rule: SupportedInstanceRenownRule) =>
    `${rule.encounter_name}: ${formatRenown(rule.points)} Renown${total > 0 ? ` (${Math.round((rule.points / total) * 100)}%)` : ""}`
  return (
    <>
      <ol className="mt-3 flex gap-0.5" aria-label="Renown points per boss">
        {rules.map((rule, i) => (
          <li
            key={rule.encounter_name}
            className="group min-w-0"
            style={{ flex: `${Math.max(rule.points, total / 100)} 1 0` }}
            title={describe(rule)}
          >
            <div
              className={cn(
                "h-2.5 transition-opacity group-hover:opacity-100",
                i === 0 && "rounded-l-full",
                i === rules.length - 1 && "rounded-r-full",
                rule.points === top ? "opacity-90" : i % 2 ? "opacity-45" : "opacity-60",
              )}
              style={{ backgroundColor: RENOWN.accent }}
            />
            <div className="mt-1.5 hidden px-0.5 sm:block">
              <div className="font-mono text-xs font-semibold leading-tight" style={{ color: RENOWN.accent }}>{formatRenown(rule.points)}</div>
              <div className="truncate text-[11px] leading-tight text-muted-foreground group-hover:text-foreground">{rule.encounter_name}</div>
            </div>
          </li>
        ))}
      </ol>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs sm:hidden" aria-hidden>
        {rules.map((rule) => (
          <li key={rule.encounter_name}>
            <span className="text-muted-foreground">{rule.encounter_name}</span>{" "}
            <span className="font-mono font-semibold" style={{ color: RENOWN.accent }}>{formatRenown(rule.points)}</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** `embedded`: inside a page that already shows the instance banner, so only the summary chips are drawn. */
export function RulesetInstanceView({ instanceName, embedded = false }: { instanceName: string; embedded?: boolean }) {
  const { data, isLoading, isError } = useSupportedInstances()
  const renown = useRenownAwards()
  const entry = rulesetEntries(data ?? [], renown).find((item) => item.name === instanceName)
  const instance = entry?.instance ?? data?.find((item) => item.name === instanceName)
  const rows = instance && !entry?.derived ? damageRuleRows(instance) : []
  // One column per award variant; most instances only have the default.
  const renownColumns = (entry?.renownAwards ?? []).map((awards) => {
    const rules = renownRuleRows(entry!, awards.rules)
    return { label: awardsLabel(awards), rules, total: sumRenown(rules) }
  })
  const labelColumns = renownColumns.length > 1
  const bossCount = entry?.speedrunRules?.requirements.filter((requirement) => requirement.category === "Bosses").length ?? 0

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
  if (isError) return <p className="py-12 text-center text-muted-foreground">Could not load rulesets. Please try again later.</p>
  if (!instance) return <p className="py-12 text-center text-muted-foreground">No rules found for {instanceName}.</p>

  const chips = (
    <div className={cn("flex flex-wrap gap-2 text-xs font-medium", !embedded && "mt-3")}>
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
      {renownColumns.map((column) => (
        <span
          key={column.label}
          className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 ring-1 backdrop-blur-sm"
          style={{ "--tw-ring-color": `${RENOWN.accent}4d` } as CSSProperties}
        >
          <RENOWN.icon className="h-3 w-3" style={{ color: RENOWN.accent }} />
          {labelColumns && `${column.label}: `}{formatRenown(column.total)} Renown per clear
        </span>
      ))}
      {rows.length > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2.5 py-1 ring-1 ring-[color:var(--tertiary)]/40 backdrop-blur-sm">
          <Swords className="h-3 w-3 text-[color:var(--tertiary)]" />
          {rows.length} DPS target {rows.length === 1 ? "rule" : "rules"}
        </span>
      )}
    </div>
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      {embedded ? (
        chips
      ) : (
        /* Hero header with instance background, matching the Statistics view */
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
              to="/leaderboards-v1/rulesets"
              className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              All rulesets
            </Link>
            <h1 className="flex flex-wrap items-baseline gap-x-2 text-xl font-bold leading-tight sm:text-2xl">
              <span>{instanceName}</span>
              <span className="text-sm font-normal text-muted-foreground sm:text-lg">Ruleset</span>
            </h1>
            {chips}
          </div>
        </div>
      )}

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

      {renownColumns.length > 0 && (
        <section aria-labelledby="renown-policy" className="space-y-4 rounded-xl border bg-card px-4 py-3 sm:px-5">
          {renownColumns.map((column, i) => (
            <div key={column.label}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                {i === 0 ? (
                  <h2 id="renown-policy" className="flex items-center gap-2 text-sm font-semibold">
                    <RENOWN.icon className="h-4 w-4" style={{ color: RENOWN.accent }} />
                    Renown per kill{labelColumns && <span className="font-normal text-muted-foreground">· {column.label}</span>}
                  </h2>
                ) : (
                  <h3 className="text-sm text-muted-foreground">{column.label}</h3>
                )}
                <span className="text-xs text-muted-foreground">
                  Instance total{" "}
                  <span className="font-mono text-sm font-semibold" style={{ color: RENOWN.accent }}>{formatRenown(column.total)}</span>
                </span>
              </div>
              <RenownShareBar rules={column.rules} total={column.total} />
            </div>
          ))}
        </section>
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
