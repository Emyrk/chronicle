import { useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom"
import type { SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { useRankingsKillTimesByBoss, useRankingsLeaderboard, useRankingsStats, useRankingsClearTimes, useRankingsKillTimes, useRankingsSuccessRates, useParseScoreSpreads, useTimeParseSpreads } from "@/api/rankingsQueries"
import { useHubSummary, type HubSummary } from "./Hub/hubSummaryAdapter"
import { cohortLabel } from "./Hub/cohortLabel"
import { AdRailStack } from "@/components/Ads/AdRailStack"
import { HubLoadError, LeaderboardsHubApp } from "./Hub/HubLanding"
import { LeaderboardHub, Overview, SkeletonRows, type HubLiveTabContext } from "./Hub/LeaderboardHub"
import { LiveHubOverview } from "./Hub/LiveHubOverview"
import { LiveHubRatings } from "./Hub/LiveHubRatings"
import { BoardSkeleton, MetricTabs, PeriodToggle } from "./Ratings/RatingLeaderboard"
import { RulesetInstanceView } from "./RulesetInstanceView"
import { PerformancesTab } from "./Hub/PerformancesTab"
import { SpeedrunsTab } from "./Hub/SpeedrunsTab"
import { StatisticsTab, type LiveStatisticsData } from "./Hub/StatisticsTab"
import { ParsingTab, type LiveParsingData } from "./Hub/ParsingTab"
import { FULL_CLEAR, defaultSpeedrunsView, type EncounterSelection, type SpeedrunsView } from "./Hub/encounterSelection"
import { liveHubBosses } from "./Hub/liveBosses"
import { hubParams, hubPath, hubTab, v2Selection } from "./v2Selection"
import { legacyLeaderboardsTarget } from "./leaderboardsState"
import { useSiteConfig } from "@/api/queries"

const ALL_REALMS = "All realms"

/** The Storybook Hub is the page. Only its data source differs in production. */
export function LeaderboardsLiveHub() {
  const [params, setParams] = useSearchParams()
  const { tab: pathTab } = useParams()
  const navigate = useNavigate()
  const { data: siteConfig } = useSiteConfig()
  const rootRatingsDisabled = siteConfig?.tenant == null && siteConfig?.root_tenant_ratings_disabled === true
  const { tab, instance, realmIDs, encounters } = v2Selection(params, pathTab)
  const requestedSize = params.get("size")
  const parsedSize = requestedSize === null ? NaN : Number(requestedSize)
  const requestedCohort = params.has("difficulty") && Number.isInteger(parsedSize) && parsedSize >= 0 && parsedSize <= 32767
    ? { difficulty: params.get("difficulty")!, maxPlayers: parsedSize } : undefined
  // The page's summary is instance metadata (cohorts, realms, roster); it does not depend on the
  // selected bosses, so picking a boss never reloads the page. Content fetches its own selection.
  const summary = useHubSummary({ instanceName: instance ?? undefined, tab: instance ? undefined : tab, realmIDs, performance: "dps",
    cohort: requestedCohort }, siteConfig !== undefined && !rootRatingsDisabled)
  const available = summary.data?.realms ?? []
  const activeRealm = realmIDs.length === 1 ? available.find((row) => row.id === realmIDs[0]) : undefined
  const selectedRealmIDs = activeRealm ? [activeRealm.id] : realmIDs.length > 1 ? realmIDs : []
  const realm = activeRealm?.name ?? ALL_REALMS
  const names = [...new Set((summary.data?.instances ?? []).map((row) => row.instance_name))]
  const choose = (key: "instance" | "realm_ids" | "encounters", value?: string) => setParams(hubParams(params, key, value))
  // Each tab is its own path; the query (instance, bosses, realm, cohort) carries over.
  const chooseTab = (next: ReturnType<typeof v2Selection>["tab"]) => {
    const updated = new URLSearchParams(params)
    // Trash is a Performances encounter only.
    if (next !== "performances" && encounters.includes("Trash")) {
      const rest = encounters.filter((name) => name !== "Trash")
      if (rest.length) updated.set("encounters", rest.join(","))
      else updated.delete("encounters")
      updated.delete("encounter")
    }
    navigate(hubPath(next, updated))
  }
  if (params.get("tab") === "speedrun" || params.get("tab") === "leaderboard") return <Navigate to={legacyLeaderboardsTarget(params)} replace />
  // Older links put the tab in the query; an unknown or "overview" path segment is the Overview.
  if (params.has("tab")) return <Navigate to={hubPath(hubTab(params.get("tab")) ?? tab, params)} replace />
  if (pathTab !== undefined && (hubTab(pathTab) === undefined || pathTab === "overview")) return <Navigate to={hubPath("overview", params)} replace />
  if (rootRatingsDisabled) return <p className="p-8 text-center text-muted-foreground">Visit a specific server to see ratings</p>
  // Only the first load (nothing on screen yet) fails the page: the hub keeps its frame, empty,
  // with the error where the boards would be.
  const failed = !summary.data && summary.isError
  const loadError = failed ? <HubLoadError onRetry={() => void summary.refetch()} retrying={summary.isFetching} /> : undefined
  // Until then the page renders its frame with skeleton rows. A new request (another instance,
  // cohort, or realm) keeps the last summary as placeholder data; that is loading too, not this
  // page's (empty) boards.
  const loading = !summary.data && !failed
  const stale = !loading && summary.isPlaceholderData
  return <div className="flex min-w-0 gap-6">
    <div className="min-w-0 flex-1">
      <LeaderboardsHubApp instance={instance ?? undefined} onInstance={(name) => choose("instance", name)}
        tab={tab} onTab={chooseTab} realm={realm} onRealm={(name) => choose("realm_ids", available.find((row) => row.name === name)?.id)}
        realms={[ALL_REALMS, ...available.map((row) => row.name)]} instances={summary.data?.instances ?? []} landingPreviews={summary.data?.landing_previews}
        loading={loading || stale} error={loadError}
        onOpenCohort={(name, cohort) => {
          // A card is one difficulty/size: open the instance on it.
          const next = hubParams(params, "instance", name)
          next.set("difficulty", cohort.difficulty)
          next.set("size", String(cohort.maxPlayers))
          setParams(next)
        }}
        renderInstance={(name) => !summary.data ? <LoadingInstanceHub error={loadError} instanceName={name} tab={tab} onTab={chooseTab} realm={realm} onInstance={() => choose("instance")} /> : <LiveInstanceHub instanceName={name} names={names} summary={summary.data!} stale={stale} realm={realm}
          realmIDs={selectedRealmIDs} encounters={encounters} tab={tab}
          onInstance={(next) => choose("instance", next)} onTab={chooseTab}
          onRealm={(name) => choose("realm_ids", available.find((row) => row.name === name)?.id)}
          difficulty={params.get("difficulty")} size={params.get("size")}
          onCohort={(difficulty, size) => { const next = new URLSearchParams(params); if (size) { next.set("difficulty", difficulty); next.set("size", size) } else { next.delete("difficulty"); next.delete("size") } setParams(next) }}
          onEncounters={(names) => choose("encounters", names.join(",") || undefined)} />} />
    </div>
    <AdRailStack primaryPlacement="leaderboards-right-rail" secondaryPlacement="leaderboards-right-rail-lower" />
  </div>
}

/** The instance page's frame while its summary loads: every summary card shows its skeleton rows.
 * With an error (the first load failed) the frame stays and the content is that error. */
function LoadingInstanceHub({ instanceName, tab, onTab, realm, onInstance, error }: {
  instanceName: string; tab: ReturnType<typeof v2Selection>["tab"]; onTab: (tab: ReturnType<typeof v2Selection>["tab"]) => void
  realm: string; onInstance: () => void; error?: ReactNode
}) {
  const live = {
    bosses: [], realms: [realm], specsFor: () => [], subSpecsFor: () => [],
    renderOverview: (context: HubLiveTabContext) => error ?? <LoadingContent context={context} overview />,
    renderTab: (context: HubLiveTabContext) => error ?? <LoadingContent context={context} />,
  }
  return <LeaderboardHub live={live} instanceName={instanceName} onAllInstances={onInstance} tab={tab} onTab={onTab} realm={realm} onRealm={() => {}} />
}

/** A tab's or the Overview's skeleton rows while the page summary loads. */
function LoadingContent({ context, overview = false }: { context: HubLiveTabContext; overview?: boolean }) {
  if (overview) return <Overview {...context.overview} data={{ pending: true }} instanceName={context.instanceName}
    scope={context.scope} role={context.role} subject={context.subject} onScope={context.onScope} onTab={context.onTab}
    onRatings={context.onRatings} onStatistics={context.onStatistics} onRole={context.onRole} />
  return context.tab === "ratings" ? <BoardSkeleton /> : <div className="overflow-hidden rounded-xl border bg-card"><SkeletonRows rows={10} /></div>
}

function LiveInstanceHub({ instanceName, names, summary, stale, realm, realmIDs, encounters, tab, difficulty, size, onInstance, onTab, onRealm, onCohort, onEncounters }: {
  instanceName: string; names: string[]; summary: HubSummary; stale: boolean; realm: string; realmIDs: string[]; encounters: readonly string[]
  tab: ReturnType<typeof v2Selection>["tab"]; difficulty: string | null; size: string | null
  onInstance: (name?: string) => void; onTab: (tab: ReturnType<typeof v2Selection>["tab"]) => void
  onRealm: (name: string) => void; onCohort: (difficulty: string, size: string) => void; onEncounters: (bosses: readonly string[]) => void
}) {
  const raids = summary.instances.filter((row) => row.instance_name === instanceName && row.category === "raid")
  // The summary resolves the URL's cohort, or the busiest one when none (or a stale one) is given.
  const resolved = summary.selected_cohort
  const cohort = (size !== null && difficulty !== null
    ? raids.find((row) => row.difficulty_name === difficulty && String(row.max_players) === size)
    : undefined) ?? raids.find((row) => row.difficulty_name === resolved?.difficulty_name && row.max_players === resolved?.max_players)
  const realmName = realm === ALL_REALMS ? undefined : realm
  const bosses = liveHubBosses(summary.encounters.map((row) => row.encounter_name),
    new Set(summary.progression_bosses ?? []), summary.ranking_encounter_sets ?? [], tab === "performances")
  // Stale names (another instance, a removed boss) drop out; nothing left is the preset.
  const chosen = bosses.filter((name) => encounters.includes(name))
  const selection: EncounterSelection = chosen.length ? { kind: "bosses", bosses: chosen } : FULL_CLEAR
  const live = {
    selection,
    onSelection: (next: EncounterSelection) => onEncounters(next.kind === "bosses" ? next.bosses : []),
    bosses,
    optionalBosses: new Set<string>(),
    realms: [ALL_REALMS, ...summary.realms.map((row) => row.name)],
    specsFor: (cls: string) => summary.filters?.find((row) => row.player_class === cls)?.specs.map((row) => row.spec) ?? [],
    subSpecsFor: (cls: string, spec: string) => summary.filters?.find((row) => row.player_class === cls)?.specs.find((row) => row.spec === spec)?.sub_specs.filter(Boolean) as string[] ?? [],
    // Difficulty and size: one button per published combination, shown when there is a choice.
    cohortPicker: raids.length > 1 ? <div role="group" aria-label="Difficulty and size" className="flex rounded-md border bg-background/60 p-0.5 text-xs">
      {raids.map((row) => {
        const current = cohort?.difficulty_name === row.difficulty_name && cohort?.max_players === row.max_players
        return <button key={`${row.difficulty_name}|${row.max_players}`} type="button" aria-pressed={current}
          onClick={() => onCohort(row.difficulty_name, String(row.max_players))}
          className={cn("cursor-pointer rounded px-2.5 py-1.5 font-medium transition-colors", current ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
          {cohortLabel(row)}
        </button>
      })}
    </div> : undefined,
    renderOverview: (context: HubLiveTabContext) => <LiveHubContent context={context} summary={summary} stale={stale} realmName={realmName} realmIDs={realmIDs} cohort={cohort} bosses={bosses} overview />,
    renderTab: (context: HubLiveTabContext) => <LiveHubContent context={context} summary={summary} stale={stale} realmName={realmName} realmIDs={realmIDs} cohort={cohort} bosses={bosses} />,
  }
  return <LeaderboardHub live={live} instanceName={instanceName} instances={names} onAllInstances={() => onInstance()}
    onSwitchInstance={(next) => onInstance(next)} tab={tab} onTab={onTab} realm={realm} onRealm={onRealm}
    initialBosses={chosen.length ? chosen : undefined} />
}

function LiveHubContent({ context, summary, stale = false, requestedEncounters = [], realmName, realmIDs, cohort, bosses, overview = false }: {
  context: HubLiveTabContext; summary: HubSummary; stale?: boolean; requestedEncounters?: readonly string[]; realmName?: string; realmIDs: readonly string[]
  cohort?: { difficulty_name: string; max_players: number }; bosses: readonly string[]; overview?: boolean
}) {
  const { instanceName, scope, role, subject, selection, onTab } = context
  const raids = summary.instances.filter((row) => row.instance_name === instanceName && row.category === "raid")
  const chosen = cohort && raids.some((row) => row.difficulty_name === cohort.difficulty_name && row.max_players === cohort.max_players) ? cohort : undefined
  // Hand-picked bosses (empty: the preset, i.e. whole-raid boards). One boss still has its own views.
  const picked = selection.kind === "bosses" ? selection.bosses : []
  const boss = picked.length === 1 ? picked[0] : undefined
  // The preset sends its bosses explicitly, as /leaderboards does: no list would rank every
  // encounter, Trash included.
  const pickedNames = (picked.length ? picked : bosses.filter((name) => name !== "Trash")).join(",") || undefined
  const exact = !!chosen
  // Omit the legacy zero-size URL parameter; exact_cohort still selects size 0
  // server-side, so a mixed-size raid cannot silently broaden this board.
  const performance = useRankingsLeaderboard({ instance_names: instanceName, encounter_names: pickedNames,
    difficulty_names: chosen?.difficulty_name, max_players: chosen?.max_players || undefined, exact_cohort: !!chosen, class: scope.cls, spec: scope.spec, sub_spec: scope.subSpec,
    metric: role === "healing" ? "hps" : "dps", realm_names: realmName, limit: 50,
  }, !overview && context.tab === "performances" && exact && realmIDs.length <= 1 && subject === "characters")
  // Speedruns shows one board at a time; only that board is fetched. Reset with the selection.
  const [speedViewState, setSpeedView] = useState<{ key: string; view: SpeedrunsView }>()
  const selectionKey = picked.join(",")
  const speedView = speedViewState?.key === selectionKey ? speedViewState.view : defaultSpeedrunsView(selection)
  const killBosses = picked.length ? picked : bosses
  const kills = useRankingsKillTimesByBoss(instanceName, killBosses, killBosses.length === 1 ? 10 : 3,
    !overview && context.tab === "speedruns" && speedView === "kills")
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
    enabled: !overview && context.tab === "speedruns" && speedView === "clear" && exact && realmIDs.length <= 1,
    staleTime: 5 * 60 * 1000,
  })
  const stats = useRankingsStats({ instance_names: instanceName, encounter_names: pickedNames, difficulty_names: chosen?.difficulty_name,
    max_players: chosen?.max_players || undefined, exact_cohort: !!chosen, realm_names: realmName, metric: role === "healing" ? "hps" : "dps" },
    !overview && context.tab === "statistics" && exact)
  const clearTimes = useRankingsClearTimes(instanceName, undefined, !overview && context.tab === "statistics" && !realmName && exact)
  const killTimes = useRankingsKillTimes(instanceName, undefined, !overview && context.tab === "statistics" && !realmName && exact)
  const successRates = useRankingsSuccessRates(instanceName, undefined,
    chosen ? { difficulty_names: chosen.difficulty_name, max_players: chosen.max_players, exact_cohort: true } : undefined,
    !overview && context.tab === "statistics" && !realmName && exact)
  const parseSpreads = useParseScoreSpreads({ metric: role === "healing" ? "hps" : "dps",
    encounterNames: picked.length ? picked : bosses, playerClass: scope.cls, playerSpec: scope.spec },
    !overview && context.tab === "parsing" && !!chosen && !realmName)
  const timeSpreads = useTimeParseSpreads(instanceName, !overview && context.tab === "parsing" && !!chosen && !realmName)
  const queryState = <T,>(query: { data?: T; isPending: boolean; isError: boolean }) => query.isError ? { status: "error" as const } : query.isPending ? { status: "loading" as const } : { status: "ready" as const, data: query.data! }
  // The summary belongs to the previous request; its boards would read as empty ones.
  if (stale) return <LoadingContent context={context} overview={overview} />
  if (!overview && realmIDs.length > 1) return <p role="status" className="rounded-xl border bg-card p-8 text-sm text-muted-foreground">Choose one realm or All realms in the Hub selector. This view cannot apply multiple realms.</p>
  if (overview) return <LiveHubOverview context={context} summary={summary} requestedEncounters={requestedEncounters} realmName={realmName} realmIDs={realmIDs} bosses={bosses} />
  if (context.tab === "ratings") return <LiveHubRatings instanceName={instanceName} bosses={bosses.filter((name) => name !== "Trash")}
    selected={picked.filter((name) => name !== "Trash")} scope={scope} onScope={context.onScope} view={context.ratingView} onView={context.onView}
    period={context.period} subject={subject === "guilds" ? "guild" : "player"} realmIDs={realmIDs} role={role}
    cohort={chosen ? { difficulty: chosen.difficulty_name, maxPlayers: chosen.max_players } : undefined}
    where={boss ?? (picked.length > 1 ? `${picked.length} bosses` : instanceName)}
    toolbar={<div className="flex flex-wrap items-center gap-2"><MetricTabs view={context.ratingView} onView={context.onView} /><PeriodToggle value={context.period} onChange={context.onPeriod} /></div>} />
  if (context.tab === "rulesets") return <RulesetInstanceView instanceName={instanceName} embedded />
  if (context.tab === "performances") return !exact ? <CohortPrompt raids={raids} /> :
    <PerformancesTab instanceName={instanceName} scope={scope} role={role} subject={subject} bosses={picked}
      where={boss ?? (picked.length > 1 ? `${picked.length} bosses` : instanceName)} onSpeedruns={() => onTab("speedruns")}
      live={{ response: performance.data, loading: performance.isPending, error: performance.isError ? performance.error : null }} />
  if (context.tab === "speedruns") return !exact ? <CohortPrompt raids={raids} /> :
    <SpeedrunsTab instanceName={instanceName} bosses={bosses} selection={selection}
      view={speedView} onView={(view) => setSpeedView({ key: selectionKey, view })}
      live={{
        clears: { entries: speed.data, loading: speed.isPending, error: speed.isError ? speed.error : null },
        kills: { entries: kills.data?.entries, loading: kills.isPending, error: kills.isError ? kills.error : null },
      }} />
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
