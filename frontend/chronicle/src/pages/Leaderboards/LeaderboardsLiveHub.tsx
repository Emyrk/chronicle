import { useQuery } from "@tanstack/react-query"
import { Navigate, useSearchParams } from "react-router-dom"
import type { SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { useRankingsEncounters, useRankingsFilters, useRankingsInstances, useRankingsLeaderboard, useRankingsStats, useRankingsClearTimes, useRankingsKillTimes, useRankingsSuccessRates, useParseScoreSpreads, useTimeParseSpreads } from "@/api/rankingsQueries"
import { useRealms, useSupportedInstanceProgressionBosses, useSupportedInstanceRankingEncounterSets } from "@/api/queries"
import { AdRailStack } from "@/components/Ads/AdRailStack"
import { LeaderboardsHubApp } from "./Hub/HubLanding"
import { LeaderboardHub, type HubLiveTabContext } from "./Hub/LeaderboardHub"
import { LiveHubOverview } from "./Hub/LiveHubOverview"
import { LiveHubRatings } from "./Hub/LiveHubRatings"
import { MetricTabs, PeriodToggle } from "./Ratings/RatingLeaderboard"
import { RulesetInstanceView } from "./RulesetInstanceView"
import { PerformancesTab } from "./Hub/PerformancesTab"
import { SpeedrunsTab } from "./Hub/SpeedrunsTab"
import { StatisticsTab, type LiveStatisticsData } from "./Hub/StatisticsTab"
import { ParsingTab, type LiveParsingData } from "./Hub/ParsingTab"
import { FULL_CLEAR, type EncounterSelection } from "./Hub/encounterSelection"
import { liveHubBosses } from "./Hub/liveBosses"
import { v2Selection, hubParams } from "./v2Selection"
import { legacyLeaderboardsTarget } from "./leaderboardsState"

const ALL_REALMS = "All realms"

/** The Storybook Hub is the page. Only its data source differs in production. */
export function LeaderboardsLiveHub() {
  const [params, setParams] = useSearchParams()
  const { tab, instance, realmIDs, encounter } = v2Selection(params)
  const instances = useRankingsInstances()
  const realms = useRealms()
  const available = realms.data ?? []
  const activeRealm = realmIDs.length === 1 ? available.find((row) => row.id === realmIDs[0]) : undefined
  const selectedRealmIDs = activeRealm ? [activeRealm.id] : realmIDs.length > 1 ? realmIDs : []
  const realm = activeRealm?.name ?? ALL_REALMS
  const names = [...new Set((instances.data ?? []).map((row) => row.instance_name))]
  const choose = (key: "tab" | "instance" | "realm_ids" | "encounter", value?: string) => setParams(hubParams(params, key, value))
  const chooseTab = (next: ReturnType<typeof v2Selection>["tab"]) => {
    const updated = hubParams(params, "tab", next)
    if (next !== "performances" && updated.get("encounter") === "Trash") updated.delete("encounter")
    setParams(updated)
  }
  if (params.get("tab") === "speedrun" || params.get("tab") === "leaderboard") return <Navigate to={legacyLeaderboardsTarget(params)} replace />
  if (instances.isPending || realms.isPending) return <p role="status" className="mx-auto max-w-[1920px] p-8 text-muted-foreground">Loading leaderboards…</p>
  if (instances.isError || realms.isError) return <p role="alert" className="mx-auto max-w-[1920px] p-8 text-muted-foreground">Could not load leaderboard instances or realms.</p>
  return <div className="flex min-w-0 gap-6">
    <div className="min-w-0 flex-1">
      <LeaderboardsHubApp instance={instance ?? undefined} onInstance={(name) => choose("instance", name)}
        tab={tab} onTab={chooseTab} realm={realm} onRealm={(name) => choose("realm_ids", available.find((row) => row.name === name)?.id)}
        realms={[ALL_REALMS, ...available.map((row) => row.name)]} instances={instances.data ?? []}
        renderInstance={(name) => <LiveInstanceHub instanceName={name} names={names} realm={realm}
          realmIDs={selectedRealmIDs} encounter={encounter} tab={tab}
          onInstance={(next) => choose("instance", next)} onTab={chooseTab}
          onRealm={(name) => choose("realm_ids", available.find((row) => row.name === name)?.id)}
          difficulty={params.get("difficulty")} size={params.get("size")}
          onCohort={(difficulty, size) => { const next = new URLSearchParams(params); if (size) { next.set("difficulty", difficulty); next.set("size", size) } else { next.delete("difficulty"); next.delete("size") } setParams(next) }}
          onEncounter={(boss) => choose("encounter", boss)} />} />
    </div>
    <AdRailStack primaryPlacement="leaderboards-right-rail" secondaryPlacement="leaderboards-right-rail-lower" />
  </div>
}

function LiveInstanceHub({ instanceName, names, realm, realmIDs, encounter, tab, difficulty, size, onInstance, onTab, onRealm, onCohort, onEncounter }: {
  instanceName: string; names: string[]; realm: string; realmIDs: string[]; encounter: string | null
  tab: ReturnType<typeof v2Selection>["tab"]; difficulty: string | null; size: string | null
  onInstance: (name?: string) => void; onTab: (tab: ReturnType<typeof v2Selection>["tab"]) => void
  onRealm: (name: string) => void; onCohort: (difficulty: string, size: string) => void; onEncounter: (boss?: string) => void
}) {
  const encounters = useRankingsEncounters(instanceName)
  const progression = useSupportedInstanceProgressionBosses()
  const rankingSets = useSupportedInstanceRankingEncounterSets()
  const filters = useRankingsFilters(instanceName)
  const realms = useRealms()
  const instances = useRankingsInstances()
  const raids = (instances.data ?? []).filter((row) => row.instance_name === instanceName && row.category === "raid")
  const cohort = raids.length === 1 ? raids[0]
    : size !== null && difficulty !== null
      ? raids.find((row) => row.difficulty_name === difficulty && String(row.max_players) === size)
      : undefined
  const realmName = realm === ALL_REALMS ? undefined : realm
  const bosses = liveHubBosses((encounters.data ?? []).map((row) => row.encounter_name),
    progression.data?.get(instanceName), rankingSets.data?.get(instanceName), tab === "performances")
  const selected = encounter && bosses.includes(encounter) ? encounter : undefined
  const selection: EncounterSelection = selected ? { kind: "bosses", bosses: [selected] } : FULL_CLEAR
  const live = {
    selection,
    onSelection: (next: EncounterSelection) => onEncounter(next.kind === "bosses" ? next.bosses[0] : undefined),
    bosses,
    optionalBosses: new Set<string>(),
    realms: [ALL_REALMS, ...(realms.data ?? []).map((row) => row.name)],
    specsFor: (cls: string) => filters.data?.find((row) => row.player_class === cls)?.specs.map((row) => row.spec) ?? [],
    subSpecsFor: (cls: string, spec: string) => filters.data?.find((row) => row.player_class === cls)?.specs.find((row) => row.spec === spec)?.sub_specs.filter(Boolean) as string[] ?? [],
    cohortPicker: raids.length > 1 ? <label className="flex items-center gap-2 text-xs text-muted-foreground">Raid cohort
      <select aria-label="Raid cohort" className="h-8 max-w-48 rounded-md border bg-background px-2 text-foreground" value={cohort ? `${cohort.difficulty_name}|${cohort.max_players}` : ""} onChange={(event) => {
        const row = raids.find((item) => `${item.difficulty_name}|${item.max_players}` === event.target.value)
        onCohort(row?.difficulty_name ?? "", row ? String(row.max_players) : "")
      }}><option value="">Choose difficulty and size</option>{raids.map((row) => <option key={`${row.difficulty_name}|${row.max_players}`} value={`${row.difficulty_name}|${row.max_players}`}>{row.difficulty_name || "Default"} · {row.max_players} players</option>)}</select>
    </label> : undefined,
    renderOverview: (context: HubLiveTabContext) => <LiveHubContent context={context} realmName={realmName} realmIDs={realmIDs} cohort={cohort} bosses={bosses} overview />,
    renderTab: (context: HubLiveTabContext) => <LiveHubContent context={context} realmName={realmName} realmIDs={realmIDs} cohort={cohort} bosses={bosses} />,
  }
  if (encounters.isPending || progression.isPending || rankingSets.isPending || filters.isPending) return <p role="status" className="p-8">Loading encounters and cohorts…</p>
  if (encounters.isError || progression.isError || rankingSets.isError || filters.isError) return <p role="alert" className="p-8">Could not load encounters or cohorts.</p>
  return <LeaderboardHub live={live} instanceName={instanceName} instances={names} onAllInstances={() => onInstance()}
    onSwitchInstance={(next) => onInstance(next)} tab={tab} onTab={onTab} realm={realm} onRealm={onRealm}
    initialBosses={selected ? [selected] : undefined} />
}

function LiveHubContent({ context, realmName, realmIDs, cohort, bosses, overview = false }: {
  context: HubLiveTabContext; realmName?: string; realmIDs: readonly string[]
  cohort?: { difficulty_name: string; max_players: number }; bosses: readonly string[]; overview?: boolean
}) {
  const { instanceName, scope, role, subject, selection, onTab, onRatings } = context
  const instances = useRankingsInstances()
  const raids = (instances.data ?? []).filter((row) => row.instance_name === instanceName && row.category === "raid")
  const chosen = cohort && raids.some((row) => row.difficulty_name === cohort.difficulty_name && row.max_players === cohort.max_players) ? cohort : undefined
  const boss = selection.kind === "bosses" && selection.bosses.length === 1 ? selection.bosses[0] : undefined
  const exact = !!chosen
  // Omit the legacy zero-size URL parameter; exact_cohort still selects size 0
  // server-side, so a mixed-size raid cannot silently broaden this board.
  const performance = useRankingsLeaderboard({ instance_names: instanceName, encounter_names: boss,
    difficulty_names: chosen?.difficulty_name, max_players: chosen?.max_players || undefined, exact_cohort: !!chosen, class: scope.cls, spec: scope.spec, sub_spec: scope.subSpec,
    metric: role === "healing" ? "hps" : "dps", realm_names: realmName, limit: 50,
  }, !overview && context.tab === "performances" && exact && realmIDs.length <= 1 && subject === "characters")
  const speed = useQuery<SpeedrunLeaderboardEntry[]>({
    queryKey: ["hub-live-speedruns", instanceName, realmName, chosen?.difficulty_name, chosen?.max_players],
    queryFn: async () => {
      const query = new URLSearchParams({ instance_name: instanceName, difficulty_name: chosen!.difficulty_name,
        instance_max_players: String(chosen!.max_players), timing: "full" })
      if (realmName) query.append("realm_name", realmName)
      const response = await fetch(`/api/v1/rankings/speedrun?${query}`)
      if (!response.ok) throw new Error(`Speedruns request failed (${response.status})`)
      return response.json() as Promise<SpeedrunLeaderboardEntry[]>
    },
    enabled: !overview && context.tab === "speedruns" && exact && !boss && realmIDs.length <= 1,
    staleTime: 5 * 60 * 1000,
  })
  const stats = useRankingsStats({ instance_names: instanceName, encounter_names: boss, difficulty_names: chosen?.difficulty_name,
    max_players: chosen?.max_players || undefined, exact_cohort: !!chosen, realm_names: realmName, metric: role === "healing" ? "hps" : "dps" },
    !overview && context.tab === "statistics" && exact)
  const clearTimes = useRankingsClearTimes(instanceName, undefined, !overview && context.tab === "statistics" && !realmName && exact)
  const killTimes = useRankingsKillTimes(instanceName, undefined, !overview && context.tab === "statistics" && !realmName && exact)
  const successRates = useRankingsSuccessRates(instanceName, undefined,
    chosen ? { difficulty_names: chosen.difficulty_name, max_players: chosen.max_players, exact_cohort: true } : undefined,
    !overview && context.tab === "statistics" && !realmName && exact)
  const parseSpreads = useParseScoreSpreads({ metric: role === "healing" ? "hps" : "dps",
    encounterNames: boss ? [boss] : bosses, playerClass: scope.cls, playerSpec: scope.spec },
    !overview && context.tab === "parsing" && !!chosen && !realmName)
  const timeSpreads = useTimeParseSpreads(instanceName, !overview && context.tab === "parsing" && !!chosen && !realmName)
  const queryState = <T,>(query: { data?: T; isPending: boolean; isError: boolean }) => query.isError ? { status: "error" as const } : query.isPending ? { status: "loading" as const } : { status: "ready" as const, data: query.data! }
  if (realmIDs.length > 1) return <p role="status" className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Choose one realm or All realms in the Hub selector. This view cannot apply multiple realms.</p>
  if (overview) return <LiveHubOverview instanceName={instanceName} selection={selection} cls={scope.cls} spec={scope.spec} subSpec={scope.subSpec}
    role={role} subject={subject === "guilds" ? "guild" : "player"} realmName={realmName} realmIDs={realmIDs}
    performanceCohort={chosen ? { difficulty: chosen.difficulty_name, maxPlayers: chosen.max_players } : undefined}
    ratingCohort={chosen && (subject === "guilds" || (scope.cls && scope.spec !== undefined)) ? {
      difficulty: chosen.difficulty_name, maxPlayers: chosen.max_players,
      ...(subject === "characters" ? { playerClass: scope.cls, spec: scope.spec, subSpec: scope.subSpec ?? "", performance: role === "healing" ? "hps" as const : "dps" as const } : {}),
    } : undefined}
    bosses={bosses} onTab={onTab} onBoss={(name) => context.setSelection({ kind: "bosses", bosses: [name] })} onRatings={onRatings} />
  if (context.tab === "ratings") return <LiveHubRatings instanceName={instanceName} bosses={bosses}
    scope={scope} onScope={context.onScope} view={context.ratingView} onView={context.onView} period={context.period}
    subject={subject === "guilds" ? "guild" : "player"} realmIDs={realmIDs} role={role} cls={scope.cls} spec={scope.spec} subSpec={scope.subSpec}
    ratingCohort={chosen ? { difficulty: chosen.difficulty_name, maxPlayers: chosen.max_players,
      ...(subject === "characters" ? { playerClass: scope.cls, spec: scope.spec ?? "", subSpec: scope.subSpec ?? "", performance: role === "healing" ? "hps" as const : "dps" as const } : {}) } : undefined}
    toolbar={<div className="flex flex-wrap items-center gap-2"><MetricTabs view={context.ratingView} onView={context.onView} /><PeriodToggle value={context.period} onChange={context.onPeriod} /></div>} />
  if (context.tab === "rulesets") return <RulesetInstanceView instanceName={instanceName} embedded />
  if (context.tab === "performances") return !exact ? <CohortPrompt raids={raids} /> :
    <PerformancesTab instanceName={instanceName} scope={scope} role={role} subject={subject} bosses={boss ? [boss] : context.selection.kind === "bosses" ? context.selection.bosses : []}
      where={boss ?? instanceName} onSpeedruns={() => onTab("speedruns")}
      live={{ response: performance.data, loading: performance.isPending, error: performance.isError ? performance.error : null }} />
  if (context.tab === "speedruns") return !exact ? <CohortPrompt raids={raids} /> : boss ?
    <p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Boss kill-time podiums are not published by the speedrun board. Select Full clear.</p> :
    <SpeedrunsTab instanceName={instanceName} bosses={[]} selection={selection} live={{ entries: speed.data, loading: speed.isPending, error: speed.isError ? speed.error : null }} />
  if (context.tab === "statistics") {
    const live: LiveStatisticsData = {
      specs: chosen ? queryState(stats) : undefined,
      clearTimes: chosen && !realmName && raids.length === 1 ? queryState(clearTimes) : undefined,
      killTimes: chosen && !realmName && raids.length === 1 ? queryState(killTimes) : undefined,
      successRates: chosen && !realmName ? queryState(successRates) : undefined,
    }
    return <StatisticsTab instanceName={instanceName} bosses={bosses} optional={new Set()}
      selection={selection} view={context.statisticsView} onView={context.onStatisticsView} scope={scope} role={role} onScope={context.onScope} live={live} />
  }
  if (context.tab === "parsing") {
    const live: LiveParsingData = {
      difficulty: chosen ? { key: `${chosen.difficulty_name}|${chosen.max_players}`, difficultyName: chosen.difficulty_name, maxPlayers: chosen.max_players, sampleSize: 0 } : undefined,
      spreads: chosen && !realmName ? parseSpreads.data?.available === false ? { status: "error" } : queryState({ ...parseSpreads, data: parseSpreads.data?.spreads }) : undefined,
      times: chosen && !realmName ? queryState({ ...timeSpreads, data: timeSpreads.data?.spreads }) : undefined,
    }
    return <ParsingTab instanceName={instanceName} allBosses={bosses} selection={selection}
      scope={scope} role={role} subject={subject} onBoss={(name) => context.setSelection({ kind: "bosses", bosses: [name] })}
      onClear={() => context.setSelection(FULL_CLEAR)} onScope={context.onScope} live={live} />
  }
  return <p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">This Hub board does not have a live adapter yet.</p>
}

function CohortPrompt({ raids }: { raids: readonly { difficulty_name: string; max_players: number }[] }) {
  return <p className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">{raids.length ? "Choose a published raid difficulty and size to view this board." : "No published raid cohort for this instance."}</p>
}
