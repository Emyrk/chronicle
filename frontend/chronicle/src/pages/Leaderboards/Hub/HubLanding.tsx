import type { LeaderboardHighlightSnapshot } from "@/api/typesGenerated"
import { useState, type ReactNode } from "react"
import { useActiveTabInView } from "@/hooks/useActiveTabInView"
import { Link } from "react-router-dom"
import type { HubLandingPreview, RankingsInstanceSummary, SupportedInstance } from "@/api/typesGenerated"
import { AlertTriangle, ArrowRight, CircleHelp, RotateCw, Skull, Swords, Timer } from "lucide-react"
import { cn } from "@/lib/utils"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { InstanceCard } from "@/pages/Rankings/InstanceCard"
import { RATING_METRICS } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { METRIC_THEMES } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { formatClock, instanceHeadlines, specStanding, type HubPlayer, type InstanceHeadline } from "./hub.fixtures"
import { LeaderboardHub, RealmPicker, type LeaderboardHubProps } from "./LeaderboardHub"
import { HUB_REALMS, useHubRealm } from "./hubRealm"
import { setMockRealm } from "@/pages/Leaderboards/Ratings/mockRealm"
import { TABS, type HubTab } from "./hubTabs"
import { HubTabHint } from "./HubTabHint"
import { peakWithRaw } from "./peakDisplay"
import { cohortLabel } from "./cohortLabel"
import { entityAttributes } from "@/components/EntityMenu/entity"
import { guildAttributes } from "@/components/EntityMenu/leaderboardEntities"
import {
  compareByRaidProgression,
  groupByRaidLevel,
} from "@/pages/Logs/utils/instanceProgressionOrder"
import { RulesetsLanding } from "@/pages/Leaderboards/RulesetsLanding"
import { awardsForCohort, formatRenown, sumRenown, type RenownAwards } from "@/pages/Leaderboards/renownConfig"

/**
 * Leaderboards entry point, framed like today's /leaderboards: the tab bar
 * stays on top of every page. With no instance chosen each tab shows the
 * instance grid, its cards carrying that tab's headline; choosing an instance
 * keeps the tab.
 */
export interface LeaderboardsHubAppProps extends Omit<LeaderboardHubProps, "instanceName" | "onAllInstances" | "tab" | "onTab" | "realm" | "onRealm" | "instances" | "onSwitchInstance"> {
  initialInstance?: string
  /** Controlled selection. Pair with onInstance so the caller can clear it. */
  instance?: string
  onInstance?: (instance?: string) => void
  tab?: HubTab
  onTab?: (tab: HubTab) => void
  realm?: string
  onRealm?: (realm: string) => void
  /** Published realm names for the picker; omit with instances only if no realm selection is available. */
  realms?: readonly string[]
  /** Published instance cohorts. Supplying this switches the grid to live, non-fixture cards. */
  instances?: readonly RankingsInstanceSummary[]
  /** Registered instance metadata used to order raid cards by progression tier. */
  supportedInstances?: readonly SupportedInstance[]
  /** Per-kill Renown by instance; the overview cards show what a clear of each cohort can grant. */
  renownAwards?: ReadonlyMap<string, readonly RenownAwards[]>
  /** Bounded published board highlights for the live all-instances grid. */
  landingPreviews?: readonly HubLandingPreview[]
  landingSnapshots?: readonly LeaderboardHighlightSnapshot[]
  landingNotice?: ReactNode
  landingBlocked?: boolean
  /** Production instance view. Never render the fixture-only LeaderboardHub for live data. */
  renderInstance?: (instance: string) => ReactNode
  /** Open an instance on one difficulty/size: live cards are one per published combination. */
  onOpenCohort?: (instance: string, cohort: { difficulty: string; maxPlayers: number }) => void
  /** Crawlable URL for an instance card, optionally scoped to one published cohort. */
  instanceHref?: (instance: string, cohort?: { difficulty: string; maxPlayers: number }) => string
  /** Crawlable URL for a leaderboard tab. */
  tabHref?: (tab: HubTab) => string
  /** Crawlable URL back to the all-instances grid. */
  allInstancesHref?: string
  /** The live summary is still loading: the grid shows skeleton cards. */
  loading?: boolean
  /** The live summary failed with nothing to show: the grid shows an empty frame with this error. */
  error?: ReactNode
}

export function LeaderboardsHubApp({
  initialInstance,
  initialTab = "overview",
  instance: controlledInstance,
  onInstance,
  tab: controlledTab,
  onTab,
  realm: controlledRealm,
  onRealm,
  realms,
  instances,
  supportedInstances,
  renownAwards,
  landingPreviews,
  landingSnapshots,
  landingNotice,
  landingBlocked,
  renderInstance,
  onOpenCohort,
  instanceHref,
  tabHref,
  allInstancesHref,
  loading,
  error,
  ...hub
}: LeaderboardsHubAppProps) {
  const live = instances !== undefined
  const availableRealms = realms ?? (live ? [] : HUB_REALMS)
  const [localInstance, setLocalInstance] = useState(initialInstance)
  const [localTab, setLocalTab] = useState<HubTab>(initialTab)
  // One realm for the grid and every instance, remembered per browser in the mock.
  const [localRealm, setLocalRealm] = useHubRealm(availableRealms, hub.initialRealm)
  const instance = onInstance ? controlledInstance : localInstance
  const tab = controlledTab ?? localTab
  const tabBarRef = useActiveTabInView<HTMLElement>(tab)
  const realm = controlledRealm ?? localRealm
  const setInstance = (next?: string) => onInstance ? onInstance(next) : setLocalInstance(next)
  const setTab = (next: HubTab) => onTab ? onTab(next) : setLocalTab(next)
  const setRealm = (next: string) => onRealm ? onRealm(next) : setLocalRealm(next)
  if (!live) setMockRealm(realm)
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* The grid has no banner, so it carries the tabs; an open instance shows them in its banner. */}
      {!instance && (
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1920px] items-center px-2 sm:px-4">
            {/* Realm first: it scopes every card in the grid. */}
            {availableRealms.length > 0 && <RealmPicker realm={realm} realms={availableRealms} onChange={setRealm} className="my-1.5 mr-3 shrink-0" />}
            <span className="mr-2 h-6 w-px shrink-0 bg-border" aria-hidden />
            <nav ref={tabBarRef} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Leaderboard section">
              {TABS.map((t) => {
                const className = cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:flex-none sm:px-4",
                  t.id === tab
                    ? "border-[#5F8FA6] text-foreground"
                    : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                )
                const content = <><t.icon className="h-4 w-4" />{t.label}</>
                return <HubTabHint key={t.id} description={t.description}>{tabHref ? (
                  <Link to={tabHref(t.id)} aria-current={t.id === tab ? "page" : undefined} className={className}>{content}</Link>
                ) : (
                  <button type="button" aria-pressed={t.id === tab} onClick={() => setTab(t.id)} className={className}>{content}</button>
                )}</HubTabHint>
              })}
            </nav>
            {/* Desktop: like the instance banner's corner, the bar ends with the explainer for Peak, Mastery, and Renown. */}
            <Link
              to="/ratings"
              title="How ratings work"
              aria-label="How ratings work"
              className="ml-2 hidden size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground sm:inline-flex"
            >
              <CircleHelp className="size-5" />
            </Link>
          </div>
        </div>
      )}
      {instance ? (
        live ? (renderInstance?.(instance) ?? <p className="mx-auto max-w-[1920px] px-4 py-8 text-sm text-muted-foreground">No live instance view available.</p>) : (
          <LeaderboardHub
            {...hub}
            instanceName={instance}
            tab={tab}
            onTab={setTab}
            onAllInstances={() => setInstance(undefined)}
            realm={realm}
            onRealm={setRealm}
            instances={instanceHeadlines().map((i) => i.name)}
            onSwitchInstance={setInstance}
            allInstancesHref={allInstancesHref}
            tabHref={tabHref}
          />
        )
      ) : (
        <HubLanding
          key={realm}
          tab={tab}
          onOpen={(name, cohort) => (cohort && onOpenCohort ? onOpenCohort(name, cohort) : setInstance(name))}
          instanceHref={instanceHref}
          instances={instances}
          supportedInstances={supportedInstances}
          renownAwards={renownAwards}
          landingPreviews={landingPreviews}
          landingSnapshots={landingSnapshots}
          landingNotice={landingNotice}
          landingBlocked={landingBlocked}
          loading={loading}
          error={error}
        />
      )}
    </div>
  )
}

function formatSnapshotAge(refreshedAt: string, now = Date.now()): string {
  const elapsedMs = Math.max(0, now - new Date(refreshedAt).getTime())
  const elapsedMinutes = Math.floor(elapsedMs / 60_000)

  if (elapsedMinutes < 1) return "Updated just now"
  if (elapsedMinutes < 60) return `Updated ${elapsedMinutes} ${elapsedMinutes === 1 ? "minute" : "minutes"} ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `Updated ${elapsedHours} hr ago`

  return "Updated >1d ago"
}

const RenownIcon = METRIC_THEMES.renown.icon

function HubLanding({
  tab,
  onOpen,
  instanceHref,
  instances,
  supportedInstances,
  renownAwards,
  landingPreviews,
  landingSnapshots,
  landingNotice,
  landingBlocked,
  loading,
  error,
}: {
  tab: HubTab
  onOpen: (instance: string, cohort?: { difficulty: string; maxPlayers: number }) => void
  instanceHref?: (instance: string, cohort?: { difficulty: string; maxPlayers: number }) => string
  instances?: readonly RankingsInstanceSummary[]
  supportedInstances?: readonly SupportedInstance[]
  renownAwards?: ReadonlyMap<string, readonly RenownAwards[]>
  landingPreviews?: readonly HubLandingPreview[]
  landingSnapshots?: readonly LeaderboardHighlightSnapshot[]
  landingNotice?: ReactNode
  landingBlocked?: boolean
  loading?: boolean
  error?: ReactNode
}) {
  if (tab === "rulesets") {
    return (
      <div className="mx-auto w-full max-w-[1920px] px-3 py-4 sm:px-4 sm:py-8">
        <RulesetsLanding instanceHref={instanceHref} onOpen={instanceHref ? undefined : onOpen} />
      </div>
    )
  }
  if (error) return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 py-4 sm:px-4 sm:py-8">
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
        {error}
      </section>
    </div>
  )
  if (loading) return <LandingSkeleton />
  if (instances !== undefined) {
    // One card per published difficulty/size, so each combination has its own headline.
    const grid = (items: readonly RankingsInstanceSummary[]) => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((row) => {
          const several = items.filter((other) => other.instance_name === row.instance_name).length > 1
          const preview = landingPreviews?.find((item) =>
            item.instance_name === row.instance_name && item.difficulty_name === row.difficulty_name && item.max_players === row.max_players)
          const snapshot = landingSnapshots?.find((item) =>
            item.instance_name === row.instance_name && item.difficulty_name === row.difficulty_name && item.max_players === row.max_players)
          const cohort = { difficulty: row.difficulty_name, maxPlayers: row.max_players }
          const renown = tab === "overview" ? awardsForCohort(renownAwards?.get(row.instance_name), row.difficulty_name, row.max_players) : undefined
          const showSnapshotAge = !landingBlocked
            && landingSnapshots !== undefined
            && tab !== "parsing"
            && snapshot?.refreshed_at
            && snapshot.status !== "not_prepared"
            && snapshot.status !== "rebuilding"
            && !(snapshot.status === "stale" && !preview)
          return <div key={`${row.instance_name}|${row.difficulty_name}|${row.max_players}`} onClickCapture={instanceHref ? undefined : (e) => {
            e.preventDefault()
            onOpen(row.instance_name, cohort)
          }}>
            <InstanceCard name={row.instance_name} to={instanceHref?.(row.instance_name, cohort) ?? "#"} badge={several ? cohortLabel(row) : undefined}>
              {landingBlocked ? null : landingSnapshots !== undefined && tab !== "parsing" ? <>
                {!snapshot || snapshot.status === "not_prepared" || snapshot.status === "rebuilding" || snapshot.status === "stale" && !preview ? <><UnavailableHighlight label="Highlights awaiting refresh" />{snapshot?.status === "stale" && <div className="text-[10px] text-muted-foreground">Stale highlights withheld until refresh</div>}</> : <>
                  {snapshot.status === "empty" ? <UnavailableHighlight label="No qualifying highlights" /> : <LiveCardBody tab={tab} preview={preview} />}
                </>}
              </> : <LiveCardBody tab={tab} preview={preview} />}
              <div className="flex items-end justify-between gap-2 text-[10px] text-muted-foreground">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-1">
                    <Skull className="h-3 w-3" />
                    {row.total_kills ? `${row.total_kills.toLocaleString()} recorded kills` : "Configured instance"}
                  </span>
                  {renown && (
                    <span className="flex items-center gap-1" title="Renown granted for killing every boss once">
                      <RenownIcon className="h-3 w-3" style={{ color: METRIC_THEMES.renown.accent }} />
                      {formatRenown(sumRenown(renown.rules))} Renown
                    </span>
                  )}
                </div>
                {showSnapshotAge && snapshot && (
                  <time className="shrink-0 text-right" dateTime={snapshot.refreshed_at} title={snapshot.refreshed_at}>
                    {snapshot.status === "stale" && "Stale · "}
                    {formatSnapshotAge(snapshot.refreshed_at)}
                  </time>
                )}
              </div>
            </InstanceCard>
          </div>
        })}
      </div>
    )
    // A configured Renown board is published leaderboard content even when the
    // legacy instance summary has no DPS rows (for example, Renown-only raids).
    const published = instances.filter((inst) => inst.total_kills > 0
      || !!awardsForCohort(renownAwards?.get(inst.instance_name), inst.difficulty_name, inst.max_players))
    const publishedNames = new Set(published.map((inst) => inst.instance_name))
    const unavailable = [...new Set(instances
      .filter((inst) => !publishedNames.has(inst.instance_name))
      .map((inst) => inst.instance_name))]
    const raids = published.filter((inst) => inst.category === "raid")
    const raidGroups = groupByRaidLevel(
      raids,
      (raid) => raid.instance_name,
      supportedInstances,
    )
    if (supportedInstances) {
      unavailable.sort((left, right) => compareByRaidProgression(left, right, supportedInstances))
    }
    const dungeons = published.filter((inst) => inst.category === "dungeon")
    const other = published.filter((inst) => inst.category !== "raid" && inst.category !== "dungeon")
    return (
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 py-4 sm:px-4 sm:py-8">
        {landingNotice}
        {published.length === 0 && <p>No published instances yet.</p>}
        {raidGroups.length > 0 && <section className="space-y-5">
          <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
          {raidGroups.map((group) => (
            <div key={group.level ?? "other"} className="space-y-3">
              {/* A single tier needs no level heading. */}
              {raidGroups.length > 1 && <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground/70">
                {group.level ? `Level ${group.level}` : "Other"}
              </h3>}
              {grid(group.items)}
            </div>
          ))}
        </section>}
        {dungeons.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Dungeons</h2>
          {grid(dungeons)}
        </section>}
        {other.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Other instances</h2>
          {grid(other)}
        </section>}
        {unavailable.length > 0 && <section className="space-y-3 border-t pt-5">
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground">Configured instances without rankings</h2>
            <p className="mt-1 text-xs text-muted-foreground/70">Open an instance to view its configured encounters and rules.</p>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {unavailable.map((name) => (
              <div key={name} onClickCapture={instanceHref ? undefined : (event) => {
                event.preventDefault()
                onOpen(name)
              }}>
                <Link to={instanceHref?.(name) ?? "#"}
                  className="group flex items-center gap-3 rounded-lg border border-dashed bg-card/30 px-3 py-2.5 text-muted-foreground/70 opacity-75 transition-colors hover:border-muted-foreground/40 hover:bg-card/50 hover:text-muted-foreground hover:opacity-100">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{name}</span>
                    <span className="block text-[10px] tracking-wide uppercase">No rankings yet</span>
                  </span>
                  <ArrowRight className="size-3.5 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-80" />
                </Link>
              </div>
            ))}
          </div>
        </section>}
      </div>
    )
  }
  const all = instanceHeadlines()
  const grid = (items: InstanceHeadline[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((inst) => (
        // Production supplies crawlable routes; the fixture-only mock swaps views in place.
        <div
          key={inst.name}
          onClickCapture={instanceHref ? undefined : (e) => {
            e.preventDefault()
            onOpen(inst.name)
          }}
        >
          <InstanceCard name={inst.name} to={instanceHref?.(inst.name) ?? "#"}>
            <CardBody tab={tab} inst={inst} />
          </InstanceCard>
        </div>
      ))}
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 py-4 sm:px-4 sm:py-8">
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
        {grid(all.filter((i) => i.kind === "raid"))}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground">Dungeons</h2>
        {grid(all.filter((i) => i.kind === "dungeon"))}
      </section>
      <p className="px-1 text-xs text-muted-foreground/70">Mock data for design review. Names, guilds, and numbers are generated.</p>
    </div>
  )
}

/** A board that could not load: an empty card with the reason and an optional retry. */
export function HubLoadError({ title = "Could not load leaderboards", message, onRetry, retrying = false }: {
  title?: string; message?: string; onRetry?: () => void; retrying?: boolean
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/60 px-6 py-16 text-center">
      <span className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
        <AlertTriangle className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{message ?? "The leaderboard service did not respond. Rankings may be rebuilding; try again in a moment."}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} disabled={retrying}
          className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-60">
          <RotateCw className={cn("size-3.5", retrying && "animate-spin")} />
          {retrying ? "Retrying…" : "Try again"}
        </button>
      )}
    </div>
  )
}

/** The raid grid while the summary loads: instance cards with their four highlight rows. */
function LandingSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto w-full max-w-[1920px] space-y-6 px-3 py-4 sm:px-4 sm:py-8">
      <section className="space-y-5">
        <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex aspect-[16/7] flex-col justify-end gap-2 rounded-xl border bg-card p-4">
              <span className="h-2.5 w-10 animate-pulse rounded bg-white/[.06]" />
              <span className="mb-1 h-5 w-44 animate-pulse rounded bg-white/[.06]" />
              {Array.from({ length: 4 }, (_, row) => (
                <span key={row} className="flex items-center gap-2">
                  <span className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${40 - row * 5}%` }} />
                  <span className="ml-auto h-3 w-16 animate-pulse rounded bg-white/[.06]" />
                </span>
              ))}
              <span className="mt-1 h-2.5 w-28 animate-pulse rounded bg-white/[.06]" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

/** Published highlights use the same tab-specific rows as the design mock. */
function LiveCardBody({ tab, preview }: { tab: HubTab; preview?: HubLandingPreview }) {
  const renown = METRIC_THEMES.renown
  const playerLine = (metric: "peak" | "ranked_mastery" | "renown", label: string) => {
    const entry = preview?.player[metric][0]
    const theme = METRIC_THEMES[metric === "ranked_mastery" ? "mastery" : metric]
    return entry && <Line key={metric} icon={<theme.icon className="size-3" style={{ color: theme.accent }} />}
      value={metric === "peak" ? withRaw({ score: entry.score, raw: entry.peak_raw }) : theme.format(entry.score)} title={`${label} #1`}><LivePlayer entry={entry} /></Line>
  }
  const speedLine = (index: number) => {
    const entry = preview?.speedruns[index]
    return entry && <Line key={entry.instance_id} icon={<span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span>}
      value={formatClock(entry.duration_ms)} title="Full clear"><GuildTag name={entry.guild_name} id={entry.guild_id} /></Line>
  }
  let rows: ReactNode = null
  if (tab === "overview") {
    const guild = preview?.guild.renown[0]
    const performance = preview?.performances[0]
    rows = <>{speedLine(0)}
      {guild && <Line icon={<renown.icon className="size-3" style={{ color: renown.accent }} />}
        value={renown.format(guild.score)} title="Guild Renown #1"><GuildTag name={guild.guild_name} id={guild.guild_id} /></Line>}
      {playerLine("peak", "Peak")}
      {performance && <Line icon={<Swords className="size-3 text-muted-foreground" />}
        value={`${Math.round(performance.dps).toLocaleString()} dps`} title="Best performance"><LivePlayer entry={performance} /></Line>}
      {!preview?.speedruns.length && !guild && !preview?.player.peak.length && !performance && <UnavailableHighlight />}
    </>
  } else if (tab === "ratings") {
    rows = <>{playerLine("peak", "Peak")}{playerLine("ranked_mastery", "Ranked Mastery")}{playerLine("renown", "Renown")}
      {!preview?.player.peak.length && !preview?.player.ranked_mastery.length && !preview?.player.renown.length && <UnavailableHighlight />}</>
  } else if (tab === "speedruns") {
    rows = <>{[0, 1, 2].map(speedLine)}{!preview?.speedruns.length && <UnavailableHighlight label="No qualifying full clears" />}</>
  } else if (tab === "performances") {
    rows = preview?.performances.length ? preview.performances.map((entry, index) =>
      <Line key={`${entry.realm_id}-${entry.player_guid || index}`} value={`${Math.round(entry.dps).toLocaleString()} dps`} title="Best performance">
        <LivePlayer entry={entry} />
      </Line>) : <UnavailableHighlight label="No recorded performances" />
  } else if (tab === "statistics") {
    rows = preview?.statistics.length ? preview.statistics.map((entry, index) =>
      <Line key={`${entry.player_class}-${entry.player_spec}-${entry.player_sub_spec ?? ""}`}
        icon={<span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span>}
        value={`${Math.round(entry.median_dps).toLocaleString()} dps`} title="Median DPS">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLASS_CSS_VAR[entry.player_class] }} />
        <span className="truncate text-foreground/90">{entry.player_sub_spec ? `${entry.player_spec} (${entry.player_sub_spec})` : entry.player_spec} {CLASS_DISPLAY[entry.player_class]}</span>
      </Line>) : <UnavailableHighlight label="No median DPS by spec yet" />
  }
  // Parsing keeps the compact card, as in Storybook.
  return rows && <div className="mb-2 space-y-0.5">{rows}</div>
}

function LivePlayer({ entry }: { entry: { player_class: string; player_name: string; player_guid: string; realm_name: string } }) {
  const name = entry.player_name || entry.player_guid
  // Alt+click opens the entity inspector; it needs the realm to identify the character.
  const attributes = entry.player_guid && entry.realm_name
    ? entityAttributes({ kind: "character", realm: entry.realm_name, guid: entry.player_guid, name, className: entry.player_class }) : {}
  return <><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLASS_CSS_VAR[entry.player_class] }} />
    <span className="truncate text-foreground/90" {...attributes}>{name}</span></>
}

/** A guild as other pages show it: amber and in angle brackets, so it never reads as a character. */
function GuildTag({ name, id }: { name: string; id?: string }) {
  return <span className="truncate text-amber-500" {...guildAttributes(id, name)}>&lt;{name || "Unknown guild"}&gt;</span>
}

function UnavailableHighlight({ label = "No published highlights yet" }: { label?: string }) {
  return <span className="text-xs text-muted-foreground">{label}</span>
}

/** Peak with the DPS behind it. Landing cards rank DPS only. */
const withRaw = (l: { score: number; raw?: number }) => peakWithRaw(l.score, l.raw)

/** Each tab's headline, in the card's existing row style. */
function CardBody({ tab, inst }: { tab: HubTab; inst: InstanceHeadline }) {
  const peak = METRIC_THEMES.peak
  const renown = METRIC_THEMES.renown
  let rows: ReactNode = null
  if (tab === "overview") {
    // One leader from each part of the hub.
    rows = (
      <>
        <Line icon={<Timer className="size-3 text-muted-foreground" />} value={formatClock(inst.fastest[0].ms)} title="Fastest full clear">
          <GuildTag name={inst.fastest[0].guild} />
        </Line>
        <Line
          icon={<renown.icon className="size-3" style={{ color: renown.accent }} />}
          value={inst.renown.value.toLocaleString()}
          title="Guild Renown #1"
        >
          <GuildTag name={inst.renown.guild} />
        </Line>
        <Line icon={<peak.icon className="size-3" style={{ color: peak.accent }} />} value={withRaw(inst.ratings.peak)} title="Peak #1">
          <Player player={inst.ratings.peak.player} />
        </Line>
        <Line
          icon={<Swords className="size-3 text-muted-foreground" />}
          value={`${inst.performances[0].value.toLocaleString()} dps`}
          title="Best performance"
        >
          <Player player={inst.performances[0].player} />
        </Line>
      </>
    )
  } else if (tab === "ratings") {
    rows = RATING_METRICS.map((m) => {
      const t = METRIC_THEMES[m]
      const l = inst.ratings[m]
      return (
        <Line key={m} icon={<t.icon className="size-3" style={{ color: t.accent }} />} value={m === "peak" ? withRaw(l) : t.format(l.score)} title={`${t.label} #1`}>
          <Player player={l.player} />
        </Line>
      )
    })
  } else if (tab === "performances") {
    // Today's statistics card: top three DPS.
    rows = inst.performances.map((p) => (
      <Line key={p.player.id} value={`${p.value.toLocaleString()} dps`} title="Best performance">
        <Player player={p.player} />
      </Line>
    ))
  } else if (tab === "speedruns") {
    rows = inst.fastest.map((f, i) => (
      <Line
        key={f.guild + i}
        icon={<span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>}
        value={formatClock(f.ms)}
        title="Full clear"
      >
        <GuildTag name={f.guild} />
      </Line>
    ))
  } else if (tab === "statistics") {
    // Top specs by median DPS (mock: seeded per instance).
    rows = specStanding(inst.name, "dps")
      .slice(0, 3)
      .map((sp, i) => (
        <Line
          key={sp.cls + sp.spec + (sp.subSpec ?? "")}
          icon={<span className="font-mono text-[10px] text-muted-foreground">{i + 1}</span>}
          value={`${sp.median} dps`}
          title="Median DPS"
        >
          <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLASS_CSS_VAR[sp.cls] }} />
          <span className="truncate text-foreground/90">
            {sp.subSpec ? `${sp.spec} (${sp.subSpec})` : sp.spec} {CLASS_DISPLAY[sp.cls]}
          </span>
        </Line>
      ))
  }
  // Parsing keeps today's bare card: name and kills.
  return (
    <>
      {rows && <div className="mb-2 space-y-0.5">{rows}</div>}
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <Skull className="h-3 w-3" />
        {inst.kills.toLocaleString()} kills · {inst.bosses} {inst.bosses === 1 ? "boss" : "bosses"}
      </div>
    </>
  )
}

function Line({ icon, value, title, children }: { icon?: ReactNode; value: string; title: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs" title={title}>
      {icon && <span className="flex w-3 shrink-0 justify-center">{icon}</span>}
      {children}
      <span className="ml-auto font-mono font-semibold text-foreground/80">{value}</span>
    </div>
  )
}

function Player({ player }: { player: HubPlayer }) {
  return (
    <>
      <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLASS_CSS_VAR[player.cls] }} />
      <span className="truncate text-foreground/90">{player.name}</span>
    </>
  )
}
