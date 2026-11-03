import type { RankingsEncounterSummary } from "@/api/typesGenerated"
import { useHubSummary, type HubSummary, type HubPlayerRatingEntry, type HubGuildRatingEntry } from "./hubSummaryAdapter"
import { CLASS_CSS_VAR } from "@/pages/Rankings/classDisplay"
import { getInstanceBackground } from "@/pages/Logs/utils/instanceImages"
import type { LiveRatingCohort } from "@/pages/Leaderboards/Ratings/liveRatingAdapter"
import type { RatingMetric } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import type { RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { BossGrid, BossStats, Card, CardLink, SpeedHero, type LiveBossSummary } from "./LeaderboardHub"
import type { EncounterSelection } from "./encounterSelection"
import type { HubTab } from "./hubTabs"

export interface LiveHubOverviewProps {
  instanceName: string
  summary: HubSummary
  /** Encounter included in the parent summary's URL, even if it has no published ratings. */
  requestedEncounter?: string
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
export function LiveHubOverview({ instanceName, summary: initialSummary, requestedEncounter, selection, cls, spec, subSpec, role, subject, realmName, realmIDs, ratingCohort, performanceCohort, onTab, onBoss, onRatings, bosses }: LiveHubOverviewProps) {
  const raids = initialSummary.instances.filter((row) => row.category === "raid" && row.instance_name === instanceName)
  const selectedBosses = selection.kind === "bosses" ? selection.bosses : []
  const boss = selectedBosses.length === 1 ? selectedBosses[0] : undefined
  const combined = selectedBosses.length > 1
  const metric = role === "healing" ? "hps" : "dps"
  const exactPerformance = !!performanceCohort && Number.isInteger(performanceCohort.maxPlayers) && performanceCohort.maxPlayers >= 0
    && raids.some((raid) => raid.difficulty_name === performanceCohort.difficulty && raid.max_players === performanceCohort.maxPlayers)
  const exactRating = !!ratingCohort && Number.isInteger(ratingCohort.maxPlayers) && ratingCohort.maxPlayers >= 0
    && raids.some((raid) => raid.difficulty_name === ratingCohort.difficulty && raid.max_players === ratingCohort.maxPlayers)
    && (subject === "guild" || (ratingCohort.playerClass === cls && (ratingCohort.spec ?? "") === (spec ?? "")
      && (ratingCohort.subSpec ?? "") === (subSpec ?? "") && ratingCohort.performance === metric))
  const ready = raids.length > 0
  // The first overview request is shared with the landing's metadata fetch. A
  // changed role/class/selection is another complete, CDN-cacheable summary URL.
  const changedScope = role !== "dps" || !!cls || !!spec || !!subSpec ||
    (!!boss && boss !== requestedEncounter)
  const refreshed = useHubSummary({ instanceName, encounterName: boss,
    cohort: ratingCohort ?? performanceCohort, performance: metric, cls, spec, subSpec, realmIDs }, changedScope)
  const summary = changedScope ? refreshed.data : initialSummary
  const loading = changedScope && refreshed.isPending
  const error = changedScope && refreshed.isError
  const selectedRatings = boss ? summary?.ratings.bosses.find((row) => row.encounter_name === boss) : summary?.ratings.raid
  const playerRatings = selectedRatings?.player
  const guildRatings = selectedRatings?.guild
  const peakRows = subject === "guild" ? guildRatings?.peak ?? [] : playerRatings?.peak ?? []
  const masteryRows = subject === "guild" ? guildRatings?.ranked_mastery ?? [] : playerRatings?.ranked_mastery ?? []
  const renownRows = subject === "guild" ? guildRatings?.renown ?? [] : playerRatings?.renown ?? []
  const fullClear = !boss && !combined
  const speedCohort = performanceCohort && raids.some((raid) => raid.difficulty_name === performanceCohort.difficulty && raid.max_players === performanceCohort.maxPlayers)
    ? performanceCohort : exactRating ? ratingCohort : undefined

  if (loading) return <p role="status">Loading raid overview…</p>
  if (error) return <p role="alert">Could not load raid overview.</p>
  if (!raids.length) return <p role="status">No published raid data for {instanceName} yet.</p>

  const where = boss ?? (combined ? `${selectedBosses.length} bosses` : "Full clear")
  const ratingRows = (entries: readonly (HubPlayerRatingEntry | HubGuildRatingEntry)[]) => entries.slice(0, 5).map((entry, i) => {
    const player = "player_guid" in entry
    const id = player ? entry.player_guid : "guild_id" in entry ? entry.guild_id : String(i)
    const name = player ? entry.player_name || entry.player_guid : "guild_id" in entry ? entry.guild_name || entry.guild_id : "Unknown guild"
    return <li key={`${entry.realm_id}-${id}`} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5 last:border-b-0">
      <span className="w-3 font-mono text-xs text-muted-foreground" aria-label={realmIDs?.length ? "Global rank unavailable for realm filter" : undefined}>{realmIDs?.length ? "" : i + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium" style={player ? { color: CLASS_CSS_VAR[entry.player_class] } : undefined}>{name}</span>
      <span className="font-mono text-sm tabular-nums">{entry.score.toLocaleString()}</span>
    </li>
  })
  const ratingColumn = (label: string, view: RatingView, entries: readonly (HubPlayerRatingEntry | HubGuildRatingEntry)[], eligible: boolean) => {
    const theme = METRIC_THEMES[view === "overview" ? "peak" : view]
    return <div className="flex min-w-0 flex-col">
      <button type="button" onClick={() => onRatings(view)} className="flex w-full cursor-pointer items-center gap-2 border-b px-3 py-2 text-left hover:bg-white/[.04]" style={{ boxShadow: `inset 0 2px 0 ${theme.accent}` }}>
        <theme.icon className="size-4" style={{ color: theme.accent }} /><span className="text-xs font-semibold tracking-wide uppercase">{label}</span>
      </button>
      {!eligible ? unavailable(combined ? "Unavailable for combined bosses" : "Exact cohort unavailable")
        : !entries.length ? unavailable("No published scores")
        : <ol>{ratingRows(entries)}</ol>}
      <button type="button" onClick={() => onRatings(view)} className="mt-auto cursor-pointer border-t border-white/5 px-3 py-2.5 text-left text-xs font-medium hover:underline" style={{ color: theme.accent }}>Full {label} board →</button>
    </div>
  }

  const bossRows = (summary?.encounters ?? []).filter((row) => bosses?.includes(row.encounter_name) ?? row.encounter_name !== "Trash")

  return <div className="space-y-5">
    {fullClear && speedCohort && summary?.speedruns?.length ?
      <SpeedHero instanceName={instanceName} scope={{}} entries={[...summary.speedruns]} onOpen={() => onTab("speedruns")} /> :
      <section className="relative overflow-hidden rounded-xl border bg-cover bg-center" style={{ backgroundImage: `url('${getInstanceBackground(instanceName)}')` }}>
        <div className="absolute inset-0 bg-background/80" />
        <span className="absolute top-3 left-4 z-10 text-xs font-medium text-muted-foreground">{boss ? `Fastest ${boss} kills` : combined ? `Fastest total kill time · ${selectedBosses.length} bosses` : "Fastest full clears"}</span>
        <CardLink label="Speedruns" onClick={() => onTab("speedruns")} className="absolute top-3 right-4 z-10" />
        <div className="relative px-4 pt-10 pb-8 text-center text-sm text-muted-foreground">{!fullClear ? "Selected boss or combined-boss speed podium unavailable" : !speedCohort ? "Choose an exact raid difficulty and size to see fastest full clears" : "No qualifying full clears yet"}</div>
      </section>}
    {boss && <BossStats boss={{ boss, kills: !realmName && !cls && !spec && !subSpec ? summary?.encounters.find((row) => row.encounter_name === boss)?.total_kills : undefined }} />}
    <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
      <Card title={`${subject === "guild" ? "Guild Ratings" : "Ratings"} · ${where}`} action={{ label: "Ratings", onClick: () => onRatings("overview") }}>
        <div className="grid flex-1 max-sm:divide-y sm:grid-cols-3 sm:divide-x">
          {ratingColumn("Peak", "peak", peakRows, ready && !combined && exactRating)}
          {ratingColumn("Ranked Mastery", "mastery", masteryRows, ready && !combined && exactRating)}
          {ratingColumn("Renown", "renown", renownRows, ready && !combined)}
        </div>
      </Card>
      <Card title={`${subject === "guild" ? "# Clears" : "Guild Renown"} · ${where}`} action={{ label: subject === "guild" ? "Speedruns" : "Renown", onClick: () => subject === "guild" ? onTab("speedruns") : onRatings("renown") }}>
        {subject === "guild" ? unavailable("Guild clear counts unavailable for this selection") :
          !guildRatings?.renown.length ? unavailable("No published guild Renown scores") : <ol>{ratingRows(guildRatings.renown)}</ol>}
      </Card>
      <Card title={`Best Performances (${subject === "guild" ? "Clear time" : metric.toUpperCase()}) · ${where}`} action={{ label: subject === "guild" ? "Speedruns" : "Performances", onClick: () => onTab(subject === "guild" ? "speedruns" : "performances") }}>
        {subject === "guild" ? unavailable("Open Speedruns for qualified guild clears") : !boss ? unavailable("Select exactly one boss for performances") : !exactPerformance ? unavailable("Choose an exact raid difficulty and size") : !summary?.performances.length ? unavailable("No recorded performances") :
          <ol>{summary.performances.map((entry, i) => <li key={entry.id} className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5"><span className="w-3 font-mono text-xs text-muted-foreground">{i + 1}</span><span className="min-w-0 flex-1 truncate text-sm" style={{ color: CLASS_CSS_VAR[entry.player_class] }}>{entry.player_name}</span><span className="font-mono text-sm tabular-nums">{entry[metric].toLocaleString()} {metric}</span></li>)}</ol>}
      </Card>
      <Card title={`Typical ${subject === "guild" ? "clear time by guild" : `${metric.toUpperCase()} parse by spec`} · ${where}`} action={{ label: "Box plot", onClick: () => onTab("statistics") }}>
        {unavailable("Distribution unavailable in this overview; open Statistics")}
      </Card>
    </div>
    <LiveBossGrid instanceName={instanceName} rows={bossRows} ratingBoards={summary?.ratings.bosses ?? []}
      scope={{ cls, spec, subSpec }} role={role} realmName={realmName}
      only={combined ? selectedBosses : undefined} onBoss={onBoss} />

  </div>
}

/** Populate the boss cards from the same published boards as the selected-boss view. */
function LiveBossGrid({ instanceName, rows, ratingBoards, scope, role, realmName, only, onBoss }: {
  instanceName: string
  rows: readonly RankingsEncounterSummary[]
  ratingBoards: HubSummary["ratings"]["bosses"]
  scope: { cls?: string; spec?: string; subSpec?: string }
  role: "dps" | "healing"
  realmName?: string
  only?: readonly string[]
  onBoss: (boss: string) => void
}) {
  const metrics = ["peak", "ranked_mastery", "renown"] as const
  const summaries: LiveBossSummary[] = rows.map((row) => {
    const ratings: NonNullable<LiveBossSummary["ratings"]> = { peak: undefined, mastery: undefined, renown: undefined }
    const board = ratingBoards.find((item) => item.encounter_name === row.encounter_name)
    metrics.forEach((metric) => {
      const entry = board?.player[metric]?.[0]
      if (entry) {
        const key: RatingMetric = metric === "ranked_mastery" ? "mastery" : metric
        ratings[key] = { score: entry.score, player: {
          id: entry.player_guid, name: entry.player_name || entry.player_guid, guild: "",
          cls: entry.player_class, spec: entry.player_spec, subSpec: entry.player_sub_spec,
          role, skill: 0,
        } }
      }
    })
    return { boss: row.encounter_name, ratings,
      // Encounter summaries are global; never present them as scoped realm/class/role results.
      kills: !realmName && !scope.cls && !scope.spec && !scope.subSpec ? row.total_kills : undefined,
      topDps: !realmName && !scope.cls && !scope.spec && !scope.subSpec && role === "dps" ? row.top_dps || undefined : undefined,
    }
  })
  return <BossGrid instanceName={instanceName} scope={scope} role={role} only={only} onBoss={onBoss} summaries={summaries} />
}
