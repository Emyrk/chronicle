import { useQuery } from "@tanstack/react-query"
import type { SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { useRankingsEncounters, useRankingsInstances, useRankingsLeaderboard } from "@/api/rankingsQueries"
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import { fetchLiveRatingPage, liveRatingURL, type LiveRatingCohort, type LiveRatingPage } from "@/pages/Leaderboards/Ratings/liveRatingAdapter"
import type { RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { BossGrid, BossStats, Card, CardLink, SpeedHero, type LiveBossSummary } from "./LeaderboardHub"
import type { EncounterSelection } from "./encounterSelection"
import type { HubTab } from "./hubTabs"

export interface LiveHubOverviewProps {
  instanceName: string
  selection: EncounterSelection
  cls?: string
  spec?: string
  subSpec?: string
  role: "dps" | "healing"
  subject: "player" | "guild"
  /** Performance and speedrun endpoints filter by realm name; ratings filter by realm ID. */
  realmName?: string
  realmIDs?: readonly string[]
  ratingCohort?: LiveRatingCohort
  performanceCohort?: { difficulty: string; maxPlayers: number }
  /** Configured raid roster; excludes historical non-boss encounters. */
  bosses?: readonly string[]
  onTab: (tab: HubTab) => void
  onBoss: (boss: string) => void
  onRatings: (view: RatingView) => void
}

const unavailable = (message: string) => <p className="px-3 py-3 text-xs text-muted-foreground">{message}</p>

/** Live data in the Storybook Hub Overview's hero, card grid, and boss grid. */
export function LiveHubOverview({ instanceName, selection, cls, spec, subSpec, role, subject, realmName, realmIDs, ratingCohort, performanceCohort, onTab, onBoss, onRatings, bosses }: LiveHubOverviewProps) {
  const instances = useRankingsInstances(!!instanceName)
  const encounters = useRankingsEncounters(instanceName)
  const raids = instances.data?.filter((row) => row.category === "raid" && row.instance_name === instanceName) ?? []
  const selectedBosses = selection.kind === "bosses" ? selection.bosses : []
  const boss = selectedBosses.length === 1 ? selectedBosses[0] : undefined
  const combined = selectedBosses.length > 1
  const metric = role === "healing" ? "hps" : "dps"
  const exactPerformance = !!performanceCohort && Number.isInteger(performanceCohort.maxPlayers) && performanceCohort.maxPlayers >= 0
    && raids.some((raid) => raid.difficulty_name === performanceCohort.difficulty && raid.max_players === performanceCohort.maxPlayers)
  const exactRating = !!ratingCohort && Number.isInteger(ratingCohort.maxPlayers) && ratingCohort.maxPlayers >= 0
    && raids.some((raid) => raid.difficulty_name === ratingCohort.difficulty && raid.max_players === ratingCohort.maxPlayers)
    && (subject === "guild" || (ratingCohort.playerClass === cls && ratingCohort.spec === (spec ?? "")
      && ratingCohort.subSpec === (subSpec ?? "") && ratingCohort.performance === metric))
  const ready = !instances.isPending && !instances.isError && raids.length > 0
  const renownURL = ready && !combined ? liveRatingURL({ instanceName, encounterName: boss, subject, metric: "renown", window: "period", realmIDs }) : null
  const peakURL = ready && !combined && exactRating ? liveRatingURL({ instanceName, encounterName: boss, subject, metric: "peak", window: "period", cohort: ratingCohort, realmIDs }) : null
  const masteryURL = ready && !combined && exactRating ? liveRatingURL({ instanceName, encounterName: boss, subject, metric: "ranked_mastery", window: "period", cohort: ratingCohort, realmIDs }) : null
  const renown = useQuery({ queryKey: ["hub-overview-rating", renownURL], queryFn: () => fetchLiveRatingPage(renownURL!), enabled: !!renownURL, staleTime: 5 * 60 * 1000, retry: false })
  const peak = useQuery({ queryKey: ["hub-overview-rating", peakURL], queryFn: () => fetchLiveRatingPage(peakURL!), enabled: !!peakURL, staleTime: 5 * 60 * 1000, retry: false })
  const mastery = useQuery({ queryKey: ["hub-overview-rating", masteryURL], queryFn: () => fetchLiveRatingPage(masteryURL!), enabled: !!masteryURL, staleTime: 5 * 60 * 1000, retry: false })
  const performances = useRankingsLeaderboard({
    instance_names: instanceName, encounter_names: boss, class: cls, spec, sub_spec: subSpec,
    difficulty_names: performanceCohort?.difficulty, max_players: performanceCohort?.maxPlayers, exact_cohort: exactPerformance,
    role: role === "healing" ? "heal" : "dps", metric, realm_names: realmName, limit: 5,
  }, ready && !!boss && exactPerformance && subject === "player")
  const fullClear = !boss && !combined
  const speedCohort = performanceCohort && raids.some((raid) => raid.difficulty_name === performanceCohort.difficulty && raid.max_players === performanceCohort.maxPlayers)
    ? performanceCohort : exactRating ? ratingCohort : undefined
  const speed = useQuery({
    queryKey: ["hub-overview-speedrun", instanceName, realmName, speedCohort?.difficulty, speedCohort?.maxPlayers],
    queryFn: async () => {
      const params = new URLSearchParams({ instance_name: instanceName, difficulty_name: speedCohort!.difficulty,
        instance_max_players: String(speedCohort!.maxPlayers), timing: "full" })
      if (realmName) params.append("realm_name", realmName)
      const response = await fetch(`/api/v1/rankings/speedrun?${params}`)
      if (!response.ok) throw new Error(`Speedruns request failed (${response.status})`)
      return response.json() as Promise<SpeedrunLeaderboardEntry[]>
    },
    enabled: ready && fullClear && !!speedCohort,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  if (instances.isPending) return <p role="status">Loading raid overview…</p>
  if (instances.isError) return <p role="alert">Could not load raid overview.</p>
  if (!raids.length) return <p role="status">No published raid data for {instanceName} yet.</p>

  const where = boss ?? (combined ? `${selectedBosses.length} bosses` : "Full clear")
  const ratingRows = (page?: LiveRatingPage) => page?.entries.slice(0, 5).map((entry, i) => {
    const player = "player_guid" in entry
    const id = player ? entry.player_guid : "guild_id" in entry ? entry.guild_id : String(i)
    const name = player ? entry.player_name || entry.player_guid : "guild_id" in entry ? entry.guild_name || entry.guild_id : "Unknown guild"
    return <li key={`${entry.realm_id}-${id}`} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5 last:border-b-0">
      <span className="w-3 font-mono text-xs text-muted-foreground" aria-label={realmIDs?.length ? "Global rank unavailable for realm filter" : undefined}>{realmIDs?.length ? "" : i + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium" style={player ? { color: CLASS_CSS_VAR[entry.player_class] } : undefined}>{name}</span>
      <span className="font-mono text-sm tabular-nums">{entry.score.toLocaleString()}</span>
    </li>
  })
  const ratingColumn = (label: string, view: RatingView, page: typeof renown, url: string | null) => {
    const theme = METRIC_THEMES[view === "overview" ? "peak" : view]
    return <div className="flex min-w-0 flex-col">
      <button type="button" onClick={() => onRatings(view)} className="flex w-full cursor-pointer items-center gap-2 border-b px-3 py-2 text-left hover:bg-white/[.04]" style={{ boxShadow: `inset 0 2px 0 ${theme.accent}` }}>
        <theme.icon className="size-4" style={{ color: theme.accent }} /><span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
      </button>
      {!url ? unavailable(combined ? "Unavailable for combined bosses" : "Exact cohort unavailable")
        : page.isPending ? unavailable("Loading published ratings…")
        : page.isError ? unavailable("Published ratings unavailable")
        : !page.data?.entries.length ? unavailable("No published scores")
        : <ol>{ratingRows(page.data)}</ol>}
      <button type="button" onClick={() => onRatings(view)} className="mt-auto cursor-pointer border-t border-white/5 px-3 py-2.5 text-left text-xs font-medium hover:underline" style={{ color: theme.accent }}>Full {label} board →</button>
    </div>
  }

  return <div className="space-y-5">
    {fullClear && speedCohort && speed.data?.length ?
      <SpeedHero instanceName={instanceName} scope={{}} entries={speed.data.slice(0, 3)} onOpen={() => onTab("speedruns")} /> :
      <section className="relative overflow-hidden rounded-xl border bg-cover bg-center" style={{ backgroundImage: `url('${getInstanceBackground(instanceName)}')` }}>
        <div className="absolute inset-0 bg-background/80" />
        <span className="absolute top-3 left-4 z-10 text-xs font-medium text-muted-foreground">{boss ? `Fastest ${boss} kills` : combined ? `Fastest total kill time · ${selectedBosses.length} bosses` : "Fastest full clears"}</span>
        <CardLink label="Speedruns" onClick={() => onTab("speedruns")} className="absolute top-3 right-4 z-10" />
        <div className="relative px-4 pt-10 pb-8 text-center text-sm text-muted-foreground">{!fullClear ? "Selected boss or combined-boss speed podium unavailable" : !speedCohort ? "Choose an exact raid difficulty and size to see fastest full clears" : speed.isPending ? "Loading speedruns…" : speed.isError ? "Speedruns unavailable" : "No qualifying full clears yet"}</div>
      </section>}
    {boss && <BossStats boss={{ boss, kills: !realmName && !cls && !spec && !subSpec ? encounters.data?.find((row) => row.encounter_name === boss)?.total_kills : undefined }} />}
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <Card title={`${subject === "guild" ? "Guild Ratings" : "Ratings"} · ${where}`} action={{ label: "Ratings", onClick: () => onRatings("overview") }}>
        <div className="grid flex-1 max-sm:divide-y sm:grid-cols-3 sm:divide-x">
          {ratingColumn("Peak", "peak", peak, peakURL)}
          {ratingColumn("Ranked Mastery", "mastery", mastery, masteryURL)}
          {ratingColumn("Renown", "renown", renown, renownURL)}
        </div>
      </Card>
      <Card title={`${subject === "guild" ? "# Clears" : "Guild Renown"} · ${where}`} action={{ label: subject === "guild" ? "Speedruns" : "Renown", onClick: () => subject === "guild" ? onTab("speedruns") : onRatings("renown") }}>
        {unavailable(subject === "guild" ? "Guild clear counts unavailable for this selection" : "Guild Renown belongs to a separate guild board; open Renown to compare guilds")}
      </Card>
      <Card title={`Best Performances (${subject === "guild" ? "Clear time" : metric.toUpperCase()}) · ${where}`} action={{ label: subject === "guild" ? "Speedruns" : "Performances", onClick: () => onTab(subject === "guild" ? "speedruns" : "performances") }}>
        {subject === "guild" ? unavailable("Open Speedruns for qualified guild clears") : !boss ? unavailable("Select exactly one boss for performances") : !exactPerformance ? unavailable("Choose an exact raid difficulty and size") : performances.isPending ? unavailable("Loading performances…") : performances.isError ? unavailable("Performances unavailable") : !performances.data?.entries.length ? unavailable("No recorded performances") :
          <ol>{performances.data.entries.map((entry, i) => <li key={entry.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5"><span className="w-3 font-mono text-xs text-muted-foreground">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm" style={{ color: CLASS_CSS_VAR[entry.player_class] }}>{entry.player_name}</span><span className="font-mono text-sm tabular-nums">{entry[metric].toLocaleString()} {metric}</span></li>)}</ol>}
      </Card>
      <Card title={`Typical ${subject === "guild" ? "clear time by guild" : `${metric.toUpperCase()} parse by spec`} · ${where}`} action={{ label: "Box plot", onClick: () => onTab("statistics") }}>
        {unavailable("Distribution unavailable in this overview; open Statistics")}
      </Card>
    </div>
    {encounters.isPending ? <section aria-label="Bosses">{unavailable("Loading bosses…")}</section> : encounters.isError ? <section aria-label="Bosses">{unavailable("Bosses unavailable")}</section> :
      <BossGrid instanceName={instanceName} scope={{ cls, spec, subSpec }} role={role} only={combined ? selectedBosses : undefined} onBoss={onBoss}
        summaries={(encounters.data ?? []).filter((row) => bosses?.includes(row.encounter_name) ?? row.encounter_name !== "Trash").map((row): LiveBossSummary => ({ boss: row.encounter_name,
          // Encounter summaries are global; never present them as scoped realm/class/role results.
          kills: !realmName && !cls && !spec && !subSpec ? row.total_kills : undefined,
          topDps: !realmName && !cls && !spec && !subSpec && role === "dps" ? row.top_dps || undefined : undefined,
        }))} />}

  </div>
}
