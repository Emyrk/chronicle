import { useState, type ReactNode } from "react"
import type { HubLandingPreview, RankingsInstanceSummary } from "@/api/typesGenerated"
import { Skull, Swords, Timer } from "lucide-react"
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
import { RulesetsLanding } from "@/pages/Leaderboards/RulesetsLanding"

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
  /** Bounded published board highlights for the live all-instances grid. */
  landingPreviews?: readonly HubLandingPreview[]
  /** Production instance view. Never render the fixture-only LeaderboardHub for live data. */
  renderInstance?: (instance: string) => ReactNode
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
  landingPreviews,
  renderInstance,
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
            <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" aria-label="Leaderboard section">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={t.id === tab}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:flex-none sm:px-4",
                    t.id === tab
                      ? "border-[#5F8FA6] text-foreground"
                      : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
            </nav>
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
          />
        )
      ) : (
        <HubLanding key={realm} tab={tab} onOpen={setInstance} instances={instances} landingPreviews={landingPreviews} />
      )}
    </div>
  )
}

function HubLanding({ tab, onOpen, instances, landingPreviews }: { tab: HubTab; onOpen: (instance: string) => void; instances?: readonly RankingsInstanceSummary[]; landingPreviews?: readonly HubLandingPreview[] }) {
  if (tab === "rulesets") {
    // Today's rulesets grid as-is; its cards link to ?instance=<name>, opened in place.
    return (
      <div
        className="mx-auto w-full max-w-[1920px] px-3 py-4 sm:px-4 sm:py-8"
        onClickCapture={(e) => {
          const href = (e.target as HTMLElement).closest("a")?.getAttribute("href")
          const name = href && new URL(href, "http://x").searchParams.get("instance")
          if (!name) return
          e.preventDefault()
          onOpen(name)
        }}
      >
        <RulesetsLanding />
      </div>
    )
  }
  if (instances !== undefined) {
    const grid = (items: readonly RankingsInstanceSummary[]) => (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[...new Set(items.map((row) => row.instance_name))].map((name) => {
          const cohorts = items.filter((row) => row.instance_name === name)
          const forCohort = (row: RankingsInstanceSummary) => landingPreviews?.find((item) =>
            item.instance_name === row.instance_name && item.difficulty_name === row.difficulty_name && item.max_players === row.max_players)
          const hasHighlight = (row: RankingsInstanceSummary) => {
            const item = forCohort(row)
            if (tab === "speedruns") return !!item?.speedruns.length
            if (tab === "ratings") return !!(item?.player.peak.length || item?.player.ranked_mastery.length || item?.player.renown.length)
            if (tab === "performances") return !!item?.performances.length
            if (tab === "statistics") return !!item?.statistics.length
            return !!(item?.speedruns.length || item?.guild.renown.length || item?.player.peak.length || item?.performances.length)
          }
          const displayed = cohorts.find(hasHighlight) ?? cohorts.find((row) => row.max_players > 0) ?? cohorts[0]
          const preview = forCohort(displayed)
          return <div key={name} onClickCapture={(e) => {
            e.preventDefault()
            onOpen(name)
          }}>
            <InstanceCard name={name} to="#">
              <LiveCardBody tab={tab} preview={preview} />
              <div className="space-y-1">
                {cohorts.map((row) => <div key={`${row.difficulty_name}-${row.max_players}`} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Skull className="h-3 w-3" />
                  {row.difficulty_name || "Default"} · {row.max_players ? `${row.max_players} players` : "size not recorded"} · {row.total_kills.toLocaleString()} recorded kills
                </div>)}
              </div>
            </InstanceCard>
          </div>
        })}
      </div>
    )
    const raids = instances.filter((inst) => inst.category === "raid")
    const dungeons = instances.filter((inst) => inst.category === "dungeon")
    const other = instances.filter((inst) => inst.category !== "raid" && inst.category !== "dungeon")
    return (
      <div className="mx-auto w-full max-w-[1920px] space-y-6 px-3 py-4 sm:px-4 sm:py-8">
        {instances.length === 0 && <p>No published instances yet.</p>}
        {raids.length > 0 && <section className="space-y-5">
          <h2 className="text-lg font-semibold text-muted-foreground">Raids</h2>
          <div className="space-y-3">{grid(raids)}</div>
        </section>}
        {dungeons.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Dungeons</h2>
          {grid(dungeons)}
        </section>}
        {other.length > 0 && <section className="space-y-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Other instances</h2>
          {grid(other)}
        </section>}
      </div>
    )
  }
  const all = instanceHeadlines()
  const grid = (items: InstanceHeadline[]) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((inst) => (
        // The real page links to /leaderboards/<tab>/<instance>; the mock swaps views in place.
        <div
          key={inst.name}
          onClickCapture={(e) => {
            e.preventDefault()
            onOpen(inst.name)
          }}
        >
          <InstanceCard name={inst.name} to="#">
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
        <div className="space-y-3">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground/70 uppercase">Level 60</h3>
          {grid(all.filter((i) => i.kind === "raid"))}
        </div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-muted-foreground">Dungeons</h2>
        {grid(all.filter((i) => i.kind === "dungeon"))}
      </section>
      <p className="px-1 text-xs text-muted-foreground/70">Mock data for design review. Names, guilds, and numbers are generated.</p>
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
      value={theme.format(entry.score)} title={`${label} #1`}><LivePlayer entry={entry} /></Line>
  }
  const speedLine = (index: number) => {
    const entry = preview?.speedruns[index]
    return entry && <Line key={entry.instance_id} icon={<span className="font-mono text-[10px] text-muted-foreground">{index + 1}</span>}
      value={formatClock(entry.duration_ms)} title="Full clear"><span className="truncate text-foreground/90">{entry.guild_name}</span></Line>
  }
  let rows: ReactNode = null
  if (tab === "overview") {
    const guild = preview?.guild.renown[0]
    const performance = preview?.performances[0]
    rows = <>{speedLine(0)}
      {guild && <Line icon={<renown.icon className="size-3" style={{ color: renown.accent }} />}
        value={renown.format(guild.score)} title="Guild Renown #1"><span className="truncate text-foreground/90">{guild.guild_name}</span></Line>}
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

function LivePlayer({ entry }: { entry: { player_class: string; player_name: string; player_guid: string } }) {
  return <><span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CLASS_CSS_VAR[entry.player_class] }} />
    <span className="truncate text-foreground/90">{entry.player_name || entry.player_guid}</span></>
}

function UnavailableHighlight({ label = "No published highlights yet" }: { label?: string }) {
  return <span className="text-xs text-muted-foreground">{label}</span>
}

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
          <span className="truncate text-foreground/90">{inst.fastest[0].guild}</span>
        </Line>
        <Line
          icon={<renown.icon className="size-3" style={{ color: renown.accent }} />}
          value={inst.renown.value.toLocaleString()}
          title="Guild Renown #1"
        >
          <span className="truncate text-foreground/90">{inst.renown.guild}</span>
        </Line>
        <Line icon={<peak.icon className="size-3" style={{ color: peak.accent }} />} value={peak.format(inst.ratings.peak.score)} title="Peak #1">
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
        <Line key={m} icon={<t.icon className="size-3" style={{ color: t.accent }} />} value={t.format(l.score)} title={`${t.label} #1`}>
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
        <span className="truncate text-foreground/90">{f.guild}</span>
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
