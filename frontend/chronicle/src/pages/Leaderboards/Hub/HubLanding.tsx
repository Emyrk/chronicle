import { useState, type ReactNode } from "react"
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
export function LeaderboardsHubApp({
  initialInstance,
  initialTab = "overview",
  ...hub
}: Omit<LeaderboardHubProps, "instanceName" | "onAllInstances" | "tab" | "onTab"> & { initialInstance?: string }) {
  const [instance, setInstance] = useState(initialInstance)
  const [tab, setTab] = useState<HubTab>(initialTab)
  // One realm for the grid and every instance, remembered per browser.
  const [realm, setRealm] = useHubRealm(HUB_REALMS, hub.initialRealm)
  setMockRealm(realm)
  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      {/* The grid has no banner, so it carries the tabs; an open instance shows them in its banner. */}
      {!instance && (
        <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1920px] items-center px-2 sm:px-4">
            {/* Realm first: it scopes every card in the grid. */}
            <RealmPicker realm={realm} realms={HUB_REALMS} onChange={setRealm} className="my-1.5 mr-3 shrink-0" />
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
      ) : (
        <HubLanding key={realm} tab={tab} onOpen={setInstance} />
      )}
    </div>
  )
}

function HubLanding({ tab, onOpen }: { tab: HubTab; onOpen: (instance: string) => void }) {
  if (tab === "rulesets") {
    // Today's rulesets grid as-is; its cards link to ?instance=<name>, which the mock opens in place.
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
