import { Fragment, useMemo, useState, type ReactNode, type Ref } from "react"
import { useActiveTabInView } from "@/hooks/useActiveTabInView"
import { createPortal } from "react-dom"
import { Link } from "react-router-dom"
import { ArrowRight, Check, ChevronDown, ChevronLeft, CircleHelp, HeartPulse, Swords, Timer, PanelLeft, Globe, List, X, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useIsMobile } from "@/hooks/useIsMobile"
import type { SpeedrunLeaderboardEntry } from "@/api/typesGenerated"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/DropdownMenu/DropdownMenu"
import { CLASS_CSS_VAR, CLASS_DISPLAY } from "@/pages/Rankings/classDisplay"
import { ClassIcon } from "@/pages/RaidPlanner/ClassIcon"
import { getInstanceBackground, getInstanceConfig } from "@/pages/Logs/utils/instanceImages"
import { Podium, PodiumList } from "@/pages/Leaderboard/Podium"
import { RATING_METRICS, scopeKind, type RatingMetric, type RatingPeriod, type RatingScope } from "@/pages/Leaderboards/Ratings/ratingBoards.fixtures"
import { MetricTabs, PeriodToggle, RatingBoards } from "@/pages/Leaderboards/Ratings/RatingLeaderboard"
import { BossPortrait, SpecIcon } from "@/pages/Leaderboards/Ratings/RatingParts"
import { METRIC_THEMES, scopeTitle, type RatingView } from "@/pages/Leaderboards/Ratings/ratingThemes"
import { ScopeBar } from "@/pages/Leaderboards/Ratings/ScopeBar"
import { CLASS_FILTER_ORDER } from "@/pages/Leaderboards/Ratings/leaderboardClassOrder"
import { formatPeakRaw, peakWithRaw } from "./peakDisplay"
import { TABS, type HubTab } from "./hubTabs"
import { HubTabHint } from "./HubTabHint"
import { EncounterSidebar } from "./EncounterSidebar"
import { GuildName, GuildRatingBoards, GuildRatingLeaders, MetricColumns } from "./GuildRatings"
import { useEntityRaidContext } from "@/components/EntityMenu/entityMenuContext"
import { entityAttributes, raidEntity } from "@/components/EntityMenu/entity"
import { StatisticsTab, type StatisticsView } from "./StatisticsTab"
import { SpeedrunsTab } from "./SpeedrunsTab"
import { PerformancesTab } from "./PerformancesTab"
import { ParsingTab } from "./ParsingTab"
import { RulesetInstanceView } from "@/pages/Leaderboards/RulesetInstanceView"
import { FULL_CLEAR, type EncounterSelection } from "./encounterSelection"
import { leaderboardRaidContext } from "./leaderboardRaidContext"
import { HUB_REALMS, useHubRealm } from "./hubRealm"
import { setMockRealm } from "@/pages/Leaderboards/Ratings/mockRealm"
import {
  fixtureOverviewData,
  formatClock,
  instanceBosses,
  OPTIONAL_BOSSES,
  specsFor,
  subSpecsFor,
  type BossSummary,
  type Cohort,
  type GuildRating,
  type GuildRow,
  type GuildTimeSpread,
  type HubPlayer,
  type HubRole,
  type HubSubject,
  type RatingLeader,
  type SpecSpread,
  type ThroughputRow,
} from "./hub.fixtures"

/**
 * Realm switch. Ratings, runs, and parses are per realm, so it sits in the banner and scopes every
 * tab; the choice is remembered per browser.
 */
export function RealmPicker({
  realm,
  realms,
  onChange,
  className,
}: {
  realm: string
  realms: readonly string[]
  onChange: (realm: string) => void
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Realm: ${realm}`}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-background/60 pr-2 pl-2.5 text-left text-sm backdrop-blur-sm transition-colors outline-none hover:bg-white/5 focus-visible:border-ring",
          className,
        )}
      >
        <Globe className="size-4 text-muted-foreground" />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="hidden text-[10px] tracking-wider text-muted-foreground uppercase sm:block">Realm</span>
          <span className="truncate font-medium">{realm}</span>
        </span>
        <ChevronDown className="ml-1 size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        {realms.map((name) => (
          <DropdownMenuItem key={name} onSelect={() => onChange(name)} className="cursor-pointer justify-between">
            {name}
            {name === realm && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Remembers whether the encounter column is collapsed, per browser. */
const ENCOUNTERS_KEY = "chronicle.leaderboards.hub.encounters"

function readEncountersOpen(): boolean {
  try {
    return localStorage.getItem(ENCOUNTERS_KEY) !== "closed"
  } catch {
    return true
  }
}

/** Guilds mode's color: the toggle, the page tint, and the guild time box plots. */
const GUILD_GOLD = "#e6c36a"

export interface HubLiveTabContext {
  tab: HubTab
  instanceName: string
  realm: string
  onSwitchInstance?: (instance: string) => void
  scope: RatingScope
  role: HubRole
  subject: HubSubject
  ratingView: RatingView
  statisticsView: StatisticsView
  onStatisticsView: (view: StatisticsView) => void
  period: RatingPeriod
  onView: (view: RatingView) => void
  onPeriod: (period: RatingPeriod) => void
  selection: EncounterSelection
  setSelection: (selection: EncounterSelection) => void
  onTab: (tab: HubTab) => void
  onRatings: (view: RatingView) => void
  onStatistics: (view: StatisticsView) => void
  onScope: (scope: RatingScope) => void
  onRole: (role: HubRole) => void
  /** The Overview's framing, computed once by the hub so live and Storybook read the same. */
  overview: Pick<OverviewProps, "kind" | "set" | "where" | "noRole" | "onGuildRatings">
}

export interface HubLiveData {
  bosses: readonly string[]
  /** Bosses represented by the default clear selection; other bosses remain individually selectable. */
  presetBosses?: readonly string[]
  optionalBosses?: ReadonlySet<string>
  /** Persist a selected encounter in the host URL without changing the Storybook path. */
  onSelection?: (selection: EncounterSelection) => void
  selection?: EncounterSelection
  /** The published raid population selected by the page. */
  cohort?: { difficultyName?: string; maxPlayers?: number }
  cohortPicker?: ReactNode
  realms: readonly string[]
  specsFor: (cls: string, role: HubRole) => string[]
  subSpecsFor: (cls: string, spec: string) => string[]
  /** Every live tab is supplied by the adapter; fixture-backed tab components are never mounted. */
  renderTab: (context: HubLiveTabContext) => ReactNode
  /** Render `Overview` with live data; the hub passes everything but the data. */
  renderOverview?: (context: HubLiveTabContext) => ReactNode
}

export interface LeaderboardHubProps {
  live?: HubLiveData
  instanceName?: string
  initialScope?: RatingScope
  /** Start on a combined set of bosses instead of the full clear or one boss. */
  initialBosses?: string[]
  initialRole?: HubRole
  initialSubject?: HubSubject
  /** Controlled character or guild view, so shared links preserve the subject. */
  subject?: HubSubject
  onSubject?: (subject: HubSubject) => void
  /** Opens a guild ratings board and updates both route-backed selections together. */
  onOpenGuildRatings?: (view: RatingView) => void
  initialTab?: HubTab
  /** Which rating board the Ratings tab opens on. */
  initialRatingView?: RatingView
  /** Controlled rating board, so Overview, Peak, Mastery, and Renown can live in the URL. */
  ratingView?: RatingView
  onRatingView?: (view: RatingView) => void
  /** Opens the Ratings tab and board together, for atomic route-backed navigation. */
  onOpenRatings?: (view: RatingView) => void
  /** Which statistics view the Statistics tab opens on. */
  initialStatisticsView?: StatisticsView
  /** Back to the instance grid. */
  onAllInstances?: () => void
  /** Crawlable URL back to the instance grid. */
  allInstancesHref?: string
  /** Instances the title can switch to; switching keeps the tab and filters. */
  instances?: readonly string[]
  onSwitchInstance?: (instance: string) => void
  /** Controlled tab, so the choice carries between the instance grid and the instance. */
  tab?: HubTab
  onTab?: (tab: HubTab) => void
  /** Crawlable URL for a leaderboard tab. */
  tabHref?: (tab: HubTab) => string
  /** Controlled realm (the app shares it with the instance grid); otherwise the page keeps its own. */
  realm?: string
  onRealm?: (realm: string) => void
  /** Realm for a first visit with nothing stored (stories). */
  initialRealm?: string
}

/**
 * Leaderboards hub mock: one scope (boss, class, spec) shared by every tab. The
 * Overview is a dashboard of summary cards for that scope; each card opens the
 * tab that holds its full board.
 */
export function LeaderboardHub({
  live,
  instanceName: requestedInstanceName,
  initialScope = {},
  initialBosses,
  initialRole = "dps",
  initialSubject = "characters",
  subject: controlledSubject,
  onSubject,
  onOpenGuildRatings,
  initialTab = "overview",
  initialRatingView = "overview",
  ratingView: controlledRatingView,
  onRatingView,
  onOpenRatings,
  initialStatisticsView = "specs",
  onAllInstances,
  allInstancesHref,
  instances,
  onSwitchInstance,
  tab: controlledTab,
  onTab,
  tabHref,
  realm: controlledRealm,
  onRealm,
  initialRealm,
}: LeaderboardHubProps) {
  const instanceName = requestedInstanceName ?? (live ? "" : "Molten Core")
  // Ratings are per realm, so the realm scopes the whole page. Stored per browser.
  const realms = live ? live.realms : HUB_REALMS
  const [ownRealm, setOwnRealm] = useHubRealm(realms, initialRealm)
  const realm = controlledRealm ?? (live && !realms.includes(ownRealm) ? realms[0] ?? "" : ownRealm)
  const setRealm = onRealm ?? setOwnRealm
  if (!live) setMockRealm(realm)
  const [ownSelection, setSelection] = useState<EncounterSelection>(
    initialBosses?.length ? { kind: "bosses", bosses: initialBosses } : initialScope.boss ? { kind: "bosses", bosses: [initialScope.boss] } : FULL_CLEAR,
  )
  const selection = live?.selection ?? ownSelection
  const selectEncounter = (next: EncounterSelection) => {
    setSelection(next)
    live?.onSelection?.(next)
  }
  const [classScope, setClassScope] = useState<RatingScope>({ cls: initialScope.cls, spec: initialScope.spec, subSpec: initialScope.subSpec })
  // Switching instance keeps tab and filters; only the encounter choice resets, since bosses differ.
  const [shownInstance, setShownInstance] = useState(instanceName)
  if (shownInstance !== instanceName) {
    setShownInstance(instanceName)
    setSelection(FULL_CLEAR)
  }
  const chosen = selection.kind === "bosses" ? selection.bosses : []
  /** Two or more bosses combined; one boss is the boss view, none is the full clear. */
  const set = chosen.length > 1 ? chosen : undefined
  const [ownSubject, setOwnSubject] = useState<HubSubject>(initialSubject)
  const subject = controlledSubject ?? ownSubject
  const setSubject = onSubject ?? setOwnSubject
  const isMobile = useIsMobile()
  const [encountersOpen, setEncountersOpenState] = useState(() => readEncountersOpen())
  const [mobileEncountersOpen, setMobileEncountersOpen] = useState(false)
  const setEncountersOpen = (open: boolean) => {
    setEncountersOpenState(open)
    try {
      localStorage.setItem(ENCOUNTERS_KEY, open ? "open" : "closed")
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
  }
  // Guilds have no class or spec: Guilds mode sets the class filter aside (kept for switching back).
  const scope: RatingScope = { boss: chosen.length === 1 ? chosen[0] : undefined, ...(subject === "guilds" ? {} : classScope) }
  /** Boards and cards narrow by scope: a boss opens that boss, a class/spec narrows the class filter. */
  const setScope = (next: RatingScope) => {
    if (next.boss !== scope.boss) selectEncounter(next.boss ? { kind: "bosses", bosses: [next.boss] } : FULL_CLEAR)
    setClassScope({ cls: next.cls, spec: next.spec, subSpec: next.subSpec })
  }
  const bosses = live ? live.bosses : instanceBosses(instanceName)
  const entityRaid = useMemo(
    () => leaderboardRaidContext(instanceName, selection, bosses, live?.presetBosses ?? bosses, live?.cohort),
    [instanceName, selection, bosses, live?.presetBosses, live?.cohort],
  )
  useEntityRaidContext(entityRaid)
  const [role, setRole] = useState<HubRole>(initialRole)
  const [ownTab, setOwnTab] = useState<HubTab>(initialTab)
  const tab = controlledTab ?? ownTab
  const tabBarRef = useActiveTabInView<HTMLElement>(tab)
  const setTab = onTab ?? setOwnTab
  const [ownRatingView, setOwnRatingView] = useState<RatingView>(initialRatingView)
  const ratingView = controlledRatingView ?? ownRatingView
  const setRatingView = onRatingView ?? setOwnRatingView
  const [period, setPeriod] = useState<RatingPeriod>("180d")
  const [statisticsView, setStatisticsView] = useState<StatisticsView>(initialStatisticsView)
  const openRatings = onOpenRatings ?? ((view: RatingView) => {
    setRatingView(view)
    setTab("ratings")
  })
  const openGuildRatings = onOpenGuildRatings ?? ((view: RatingView) => {
    setSubject("guilds")
    openRatings(view)
  })
  const ratingToolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <MetricTabs view={ratingView} onView={setRatingView} />
      <PeriodToggle value={period} onChange={setPeriod} />
    </div>
  )
  const openStatistics = (view: StatisticsView) => {
    setStatisticsView(view)
    setTab("statistics")
  }
  const kind = scopeKind(scope)
  const where = set ? `${set.length} bosses` : (scope.boss ?? (live ? instanceName : getInstanceConfig(instanceName)?.abbrev ?? instanceName))
  const title = set ? `${instanceName} · ${set.length} bosses` : live ? instanceName : scopeTitle(scope, instanceName)
  const crumbs: { label: string; color?: string }[] = [
    { label: set ? `${set.length} bosses` : (scope.boss ?? "Full clear") },
    ...(scope.cls ? [{ label: CLASS_DISPLAY[scope.cls], color: CLASS_CSS_VAR[scope.cls] }] : []),
    ...(scope.spec ? [{ label: scope.spec, color: CLASS_CSS_VAR[scope.cls!] }] : []),
    ...(scope.subSpec ? [{ label: scope.subSpec, color: CLASS_CSS_VAR[scope.cls!] }] : []),
  ]

  const changeRole = (next: HubRole) => {
    setRole(next)
    // A spec belongs to one role; drop it when it no longer fits.
    if (scope.cls && scope.spec && !(live ? live.specsFor : specsFor)(scope.cls, next).includes(scope.spec)) setClassScope({ cls: scope.cls })
  }
  const liveContext: HubLiveTabContext = {
    tab, instanceName, realm, onSwitchInstance, scope, role, subject, ratingView, statisticsView, period,
    onView: setRatingView, onStatisticsView: setStatisticsView, onPeriod: setPeriod, selection,
    setSelection: selectEncounter, onTab: setTab, onRatings: openRatings,
    onStatistics: openStatistics, onScope: setScope, onRole: changeRole,
    overview: { kind, set, where, noRole: !!scope.cls && (live ? live.specsFor : specsFor)(scope.cls, role).length === 0, onGuildRatings: openGuildRatings },
  }

  // Guilds mode tints the page gold, the Guilds toggle's color: a faint wash from the top, a gold-edged
  // banner, and a "Guilds" crumb. Characters is the default and stays neutral.
  const guildMode = subject === "guilds"
  const compactFilterSummary = [
    scope.cls ? CLASS_DISPLAY[scope.cls] : undefined,
    scope.spec,
    scope.subSpec,
    role === "dps" ? "DPS" : "Healing",
    subject === "characters" ? "Characters" : "Guilds",
  ]
    .filter(Boolean)
    .join(" · ")
  const compactClasses = scope.cls ? [scope.cls] : CLASS_FILTER_ORDER.slice(0, 4)
  const remainingCompactClasses = scope.cls ? 0 : CLASS_FILTER_ORDER.length - compactClasses.length
  return (
    <div
      className="min-h-screen w-full bg-background text-foreground transition-[background] duration-500"
      style={
        guildMode
          ? { backgroundImage: `radial-gradient(ellipse 90% 520px at 50% 0%, color-mix(in srgb, ${GUILD_GOLD} 7%, transparent), transparent)` }
          : undefined
      }
    >
      {/* Full width like the statistics leaderboard. */}
      <div className="mx-auto w-full max-w-[1920px] px-3 py-4 sm:px-4 sm:py-8">
        <div className="min-w-0 space-y-5">
          <HubBanner
            guildMode={guildMode}
            background={getInstanceBackground(instanceName)}
            allHref={allInstancesHref}
            onAll={onAllInstances}
            crumbs={crumbs}
            crumbSuffix={scope.boss && (live ? live.optionalBosses?.has(scope.boss) : OPTIONAL_BOSSES.has(scope.boss)) && <span className="text-muted-foreground/70">· Optional</span>}
            title={<InstanceTitle instanceName={instanceName} instances={instances} onSwitch={onSwitchInstance} />}
            realm={realm}
            realms={realms}
            onRealm={setRealm}
            subtitle={set && <p className="mt-1 hidden text-xs text-muted-foreground sm:block">Combined: {set.join(", ")} · ratings averaged, time is total kill time</p>}
            tabs={TABS}
            activeTab={tab}
            tabHref={tabHref}
            onTab={setTab}
            tabBarRef={tabBarRef}
            filters={
                <ScopeBar
                  scope={scope}
                  classDisabled={subject === "guilds" ? "Guild ratings don't split by class. Switch to Characters to filter by class." : undefined}
                  showBoss={false}
                  specs={scope.cls ? (live ? live.specsFor : specsFor)(scope.cls, role) : []}
                  subSpecs={scope.cls && scope.spec ? (live ? live.subSpecsFor : subSpecsFor)(scope.cls, scope.spec) : []}
                  onChange={(next) => {
                    // "Whole raid" clears everything, the encounter choice included.
                    if (!next.boss && !next.cls && !next.spec) selectEncounter(FULL_CLEAR)
                    setClassScope({ cls: next.cls, spec: next.spec, subSpec: next.subSpec })
                  }}
                  compact={isMobile}
                  compactSummary={compactFilterSummary}
                  compactIndicator={
                    subject === "characters" ? (
                      <span
                        className="flex shrink-0 items-center"
                        aria-label={scope.cls ? `${CLASS_DISPLAY[scope.cls]} selected` : `All ${CLASS_FILTER_ORDER.length} classes selected`}
                      >
                        <span className="flex -space-x-1">
                          {compactClasses.map((cls) => (
                            <ClassIcon key={cls} cls={cls} className="size-4 rounded-sm border border-background/80" />
                          ))}
                        </span>
                        {remainingCompactClasses > 0 && <span className="ml-1 text-[10px] font-medium text-muted-foreground">+{remainingCompactClasses}</span>}
                      </span>
                    ) : undefined
                  }
                  extra={
                    <>
                      {live?.cohortPicker}
                      <Segmented
                        label="Role"
                        value={role}
                        options={[
                          { value: "dps", label: "DPS", color: "#e5484d" },
                          { value: "healing", label: "Healing", color: "#46a758" },
                        ]}
                        onChange={changeRole}
                      />
                      <Segmented
                        label="Rank"
                        value={subject}
                        options={[
                          { value: "characters", label: "Characters", color: "#5b9bd5" },
                          { value: "guilds", label: "Guilds", color: GUILD_GOLD },
                        ]}
                        onChange={setSubject}
                      />
                    </>
                  }
                />
            }
          />

          {/* Banner spans the page; below it, the site's encounter column sits beside the content. */}
          {/* Keyed by realm: every board below is that realm's, so a switch rebuilds them. */}
          <div key={realm} className="flex flex-col gap-5 lg:flex-row lg:gap-0">
            {/* Rulesets describe the whole instance; encounter selection does not apply. */}
            {tab !== "rulesets" &&
              (encountersOpen ? (
                <div className="hidden shrink-0 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100vh-2rem)] lg:w-[267px] lg:self-start lg:overflow-y-auto lg:border-r lg:pt-1 lg:pr-4 styled-scrollbar">
                  <EncounterSidebar
                    instanceName={instanceName}
                    bosses={bosses}
                    preset={live?.presetBosses}
                    optional={live ? live.optionalBosses ?? new Set<string>() : OPTIONAL_BOSSES}
                    trash={live && tab === "performances" ? new Set(["Trash"]) : undefined}
                    selection={selection}
                    onSelect={selectEncounter}
                    onCollapse={() => setEncountersOpen(false)}
                  />
                </div>
              ) : (
                // Collapsed to the left: a slim rail keeps the way back in the same place.
                <div className="hidden shrink-0 lg:sticky lg:top-4 lg:block lg:self-start lg:pt-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setEncountersOpen(true)}
                    title="Show encounter sidebar"
                    aria-label="Show encounters"
                    className="bg-card text-foreground shadow-sm hover:text-foreground"
                  >
                    <PanelLeft className="h-5 w-5" />
                  </Button>
                </div>
              ))}
            <div className={cn("min-w-0 flex-1 space-y-5", tab !== "rulesets" && (encountersOpen ? "lg:pl-6" : "lg:pl-4"))}>
              {live ? (
                tab === "overview" && live.renderOverview ? live.renderOverview(liveContext) : live.renderTab(liveContext)
              ) : tab === "overview" ? (
                <Overview
                  {...liveContext.overview}
                  data={fixtureOverviewData(instanceName, scope, role, set)}
                  instanceName={instanceName}
                  scope={scope}
                  role={role}
                  subject={subject}
                  onScope={setScope}
                  onTab={setTab}
                  onRatings={openRatings}
                  onStatistics={openStatistics}
                  onRole={changeRole}
                />
              ) : tab === "ratings" ? (
                <div className="space-y-5">
                  {/* The metric switch and period sit in the board's own header: no second tab bar under the page tabs. */}
                  {subject === "guilds" ? (
                    <GuildRatingBoards
                      toolbar={ratingToolbar}
                      instanceName={instanceName}
                      view={ratingView}
                      onView={setRatingView}
                      bosses={chosen.length ? chosen : undefined}
                      allBosses={bosses}
                      where={where}
                      onBoss={(boss) => setSelection({ kind: "bosses", bosses: [boss] })}
                    />
                  ) : (
                    <RatingBoards
                      toolbar={ratingToolbar}
                      instanceName={instanceName}
                      scope={scope}
                      onScope={setScope}
                      view={ratingView}
                      onView={setRatingView}
                      period={period}
                      bosses={set}
                      title={set ? `${set.length} bosses` : undefined}
                    />
                  )}
                </div>
              ) : tab === "rulesets" ? (
                <RulesetInstanceView instanceName={instanceName} embedded />
              ) : tab === "performances" ? (
                <PerformancesTab
                  instanceName={instanceName}
                  scope={scope}
                  role={role}
                  subject={subject}
                  bosses={set ?? bosses}
                  where={where}
                  onSpeedruns={() => setTab("speedruns")}
                />
              ) : tab === "parsing" ? (
                <ParsingTab
                  instanceName={instanceName}
                  allBosses={bosses}
                  selection={selection}
                  scope={scope}
                  role={role}
                  subject={subject}
                  onBoss={(boss) => setSelection({ kind: "bosses", bosses: [boss] })}
                  onClear={() => setSelection(FULL_CLEAR)}
                  onScope={setScope}
                />
              ) : tab === "speedruns" ? (
                <SpeedrunsTab instanceName={instanceName} bosses={bosses} selection={selection} />
              ) : tab === "statistics" ? (
                <StatisticsTab
                  instanceName={instanceName}
                  bosses={bosses}
                  optional={OPTIONAL_BOSSES}
                  selection={selection}
                  view={statisticsView}
                  onView={setStatisticsView}
                  scope={scope}
                  role={role}
                  onScope={setScope}
                />
              ) : (
                <TabPlaceholder tab={tab} title={title} />
              )}
            </div>
          </div>

          {!live && <p className="px-1 text-xs text-muted-foreground/70">Mock data for design review. Names, guilds, and numbers are generated.</p>}
        </div>
      </div>
      {tab !== "rulesets" && isMobile && createPortal(
        <>
          {mobileEncountersOpen && (
            <>
              <div
                aria-hidden="true"
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setMobileEncountersOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Encounter selector"
                className="fixed inset-y-0 left-0 z-50 w-[267px] max-w-[calc(100vw-3rem)] overflow-y-auto border-r bg-background p-4 shadow-lg styled-scrollbar"
              >
                <EncounterSidebar
                  instanceName={instanceName}
                  bosses={bosses}
                  preset={live?.presetBosses}
                  optional={live ? live.optionalBosses ?? new Set<string>() : OPTIONAL_BOSSES}
                  trash={live && tab === "performances" ? new Set(["Trash"]) : undefined}
                  selection={selection}
                  onSelect={selectEncounter}
                  onCollapse={() => setMobileEncountersOpen(false)}
                />
              </div>
            </>
          )}
          <Button
            variant="default"
            size="icon"
            onClick={() => setMobileEncountersOpen((open) => !open)}
            data-floating-corner="bottom-left"
            className="fixed bottom-[calc(2rem+var(--compare-tray-offset,0px)+var(--mobile-ad-offset,0px))] left-8 z-50 h-14 w-14 rounded-full shadow-lg"
            title={mobileEncountersOpen ? "Close encounters" : "Show encounters"}
            aria-label={mobileEncountersOpen ? "Close encounters" : "Show encounters"}
          >
            {mobileEncountersOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
          </Button>
        </>,
        document.body,
      )}
    </div>
  )
}

/** The instance name; with a list to choose from, it opens a menu that switches instance in place. */
function InstanceTitle({
  instanceName,
  instances,
  onSwitch,
}: {
  instanceName: string
  instances?: readonly string[]
  onSwitch?: (instance: string) => void
}) {
  const heading = (
    <h1 className="truncate font-wow text-xl sm:text-3xl" {...entityAttributes(raidEntity(instanceName))}>
      {instanceName}
    </h1>
  )
  if (!instances?.length || !onSwitch) return <div className="mt-1 min-w-0">{heading}</div>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${instanceName}, switch instance`}
        className="mt-0.5 -ml-2 flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg px-2 py-0.5 outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-ring sm:gap-2"
      >
        {heading}
        <ChevronDown className="size-5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        {instances.map((name) => (
          <DropdownMenuItem key={name} onSelect={() => onSwitch(name)} className="cursor-pointer justify-between">
            {name}
            {name === instanceName && <Check className="size-4 text-muted-foreground" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Everything the Overview draws, already scoped to the page's boss, class, spec, role, and realm.
 * A missing slot means the data is not published for this scope: its card keeps its place and says so.
 */
export interface OverviewSectionState {
  pending?: boolean
  error?: boolean
}

export interface OverviewSectionStates {
  ratings?: OverviewSectionState
  performances?: OverviewSectionState
  speedruns?: OverviewSectionState
  statistics?: OverviewSectionState
  bosses?: OverviewSectionState
}

export interface OverviewData {
  /** Fastest runs, fastest first: the podium shows three, the guild card all of them. */
  speedruns?: readonly SpeedrunLeaderboardEntry[]
  /** The runs are full clears even with a set of bosses chosen (set kill times live on Speedruns). */
  speedrunsAreClears?: boolean
  ratings?: Record<RatingMetric, RatingLeader[]>
  guildRatings?: Record<RatingMetric, GuildRating[]>
  guildRenown?: GuildRow[]
  guildClears?: GuildRow[]
  performances?: ThroughputRow[]
  /** Every spec in the role, best median first. */
  specSpreads?: SpecSpread[]
  /** The chosen class's specs, for the class overview's headline cards. */
  cohorts?: Cohort[]
  guildTimeSpreads?: GuildTimeSpread[]
  /** The chosen boss's stats. */
  boss?: LiveBossSummary
  bosses?: readonly LiveBossSummary[]
  optionalBosses?: ReadonlySet<string>
  /** Independent request state for live overview sections. */
  sections?: OverviewSectionStates
  /** Still loading: empty slots read as loading rather than unpublished. */
  pending?: boolean
}

/** A card body for a slot without rows: skeleton rows while loading, else why it is empty. */
function Empty({ pending, rows, text = "Not published for this selection yet", error = false }: {
  pending?: boolean
  rows?: number
  text?: string
  error?: boolean
}) {
  if (pending && !error) return <SkeletonRows rows={rows} />
  return <p role={error ? "alert" : undefined} className="px-4 py-6 text-center text-xs text-muted-foreground">{text}</p>
}

/** Placeholder rows in a card's row rhythm while its data loads. */
/**
 * The leaderboard banner: breadcrumb, title and realm, section tabs, and the
 * filter bar. The instance hub and the career board share it; each supplies
 * its own crumbs, title, tabs, and filters.
 */
export function HubBanner<T extends string>({
  guildMode,
  background,
  allHref,
  onAll,
  crumbs,
  crumbSuffix,
  title,
  realm,
  realms,
  onRealm,
  subtitle,
  tabs,
  activeTab,
  tabHref,
  onTab,
  tabBarRef,
  filters,
}: {
  /** Guilds mode: a gold-edged banner and a "Guilds" crumb. */
  guildMode: boolean
  background: string
  /** The way back to the leaderboards grid: a link, a callback, or plain text. */
  allHref?: string
  onAll?: () => void
  crumbs: { label: string; color?: string }[]
  crumbSuffix?: ReactNode
  title: ReactNode
  realm: string
  realms: readonly string[]
  onRealm: (realm: string) => void
  subtitle?: ReactNode
  tabs: readonly { id: T; label: string; icon: LucideIcon; description: string }[]
  activeTab: T
  tabHref?: (tab: T) => string
  onTab: (tab: T) => void
  tabBarRef?: Ref<HTMLElement>
  filters: ReactNode
}) {
  return (
    <header
      className="relative overflow-hidden rounded-xl border bg-card transition-[border-color,box-shadow] duration-500"
      style={
        guildMode
          ? {
              borderColor: `color-mix(in srgb, ${GUILD_GOLD} 35%, transparent)`,
              boxShadow: `0 0 0 1px color-mix(in srgb, ${GUILD_GOLD} 10%, transparent), 0 8px 40px -12px color-mix(in srgb, ${GUILD_GOLD} 25%, transparent)`,
            }
          : undefined
      }
    >
      <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/30" />
      {/* Desktop: the banner's corner links to the explainer for Peak, Mastery, and Renown. */}
      <Link
        to="/ratings"
        title="How ratings work"
        aria-label="How ratings work"
        className="absolute top-3 right-4 z-10 hidden size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground sm:inline-flex"
      >
        <CircleHelp className="size-5" />
      </Link>
      <div className="relative flex min-w-0 items-end gap-3 px-3 pt-4 pb-3 sm:flex-wrap sm:gap-4 sm:px-6 sm:pt-10 sm:pb-4">
        <div className="min-w-0 flex-1">
          {/* Breadcrumb: the parent is the way back to the grid; the rest names the current scope. */}
          <nav
            aria-label="Breadcrumb"
            className="hidden flex-wrap items-center gap-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase sm:flex"
          >
            {allHref ? (
              <Link
                to={allHref}
                title="All instances"
                className="-ml-0.5 inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                Leaderboards
              </Link>
            ) : onAll ? (
              <button
                type="button"
                onClick={onAll}
                title="All instances"
                className="-ml-0.5 inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" />
                Leaderboards
              </button>
            ) : (
              <span>Leaderboards</span>
            )}
            {guildMode && (
              <>
                <span className="opacity-50">/</span>
                <span style={{ color: GUILD_GOLD }}>Guilds</span>
              </>
            )}
            {crumbs.map((c) => (
              <Fragment key={c.label}>
                <span className="opacity-50">/</span>
                <span style={c.color ? { color: c.color } : undefined}>{c.label}</span>
              </Fragment>
            ))}
            {crumbSuffix}
          </nav>
          {/* The realm sits beside the title: together they name what every board below ranks. */}
          <div className="flex min-w-0 items-center justify-between gap-3 sm:flex-wrap sm:justify-start sm:gap-x-4 sm:gap-y-2">
            {title}
            <RealmPicker realm={realm} realms={realms} onChange={onRealm} className="shrink-0" />
          </div>
          {subtitle}
        </div>
      </div>
      <nav ref={tabBarRef} className="relative flex overflow-x-auto border-t border-white/5 px-2 sm:px-4" aria-label="Leaderboard section">
        {tabs.map((t) => {
          const className = cn(
            "cursor-pointer flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4",
            t.id === activeTab
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
          )
          const content = <><t.icon className={cn("size-4", t.id === activeTab && "text-primary")} />{t.label}</>
          return <HubTabHint key={t.id} description={t.description}>{tabHref ? (
            <Link to={tabHref(t.id)} aria-current={t.id === activeTab ? "page" : undefined} className={className}>{content}</Link>
          ) : (
            <button type="button" aria-pressed={t.id === activeTab} onClick={() => onTab(t.id)} className={className}>{content}</button>
          )}</HubTabHint>
        })}
      </nav>
      {filters}
    </header>
  )
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y divide-white/5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <span className="size-5 shrink-0 animate-pulse rounded-sm bg-white/[.06]" />
          <span className="h-3 animate-pulse rounded bg-white/[.06]" style={{ width: `${55 - i * 6}%` }} />
          <span className="ml-auto h-3 w-12 animate-pulse rounded bg-white/[.06]" />
        </div>
      ))}
    </div>
  )
}

/** The boss cards' grid while it loads. */
function BossGridSkeleton() {
  return (
    <section aria-label="Bosses" className="space-y-3">
      <h2 className="px-1 text-sm font-semibold">Bosses</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border bg-card" />
        ))}
      </div>
    </section>
  )
}

/** Each card lists a fixed number of rows; its skeleton shows that many while loading. */
function filled<T>(
  rows: readonly T[] | undefined,
  state: OverviewSectionState | boolean | undefined,
  render: (rows: readonly T[]) => ReactNode,
  skeletonRows?: number,
  errorText = "Could not load this section",
) {
  const resolved = typeof state === "object" ? state : { pending: state }
  return rows?.length
    ? render(rows)
    : <Empty pending={resolved.pending} error={resolved.error} rows={skeletonRows}
        text={resolved.error ? errorText : rows ? "No entries yet" : undefined} />
}

/** Rows on the overview cards whose lists have a fixed length. */
export const GUILD_RENOWN_ROWS = 6
const PERFORMANCE_ROWS = 8
const SPEC_SPREAD_ROWS = 8

export interface OverviewProps {
  data: OverviewData
  instanceName: string
  scope: RatingScope
  role: HubRole
  subject: HubSubject
  kind: ReturnType<typeof scopeKind>
  /** Combined bosses, when two or more are chosen. */
  set?: readonly string[]
  where: string
  /** The chosen class has no spec in this role. */
  noRole: boolean
  onScope: (scope: RatingScope) => void
  onTab: (tab: HubTab) => void
  onRatings: (view: RatingView) => void
  /** Opens a ratings board in guild mode. */
  onGuildRatings: (view: RatingView) => void
  onStatistics: (view: StatisticsView) => void
  onRole: (role: HubRole) => void
}

export function Overview({ data, instanceName, scope, role, subject, kind, set, where, noRole, onScope, onTab, onRatings, onGuildRatings, onStatistics, onRole }: OverviewProps) {
  const roleLabel = role === "dps" ? "DPS" : "HPS"
  const guilds = subject === "guilds"
  const { pending } = data
  const section = (name: keyof OverviewSectionStates): OverviewSectionState =>
    data.sections?.[name] ?? { pending }
  const ratingsState = section("ratings")
  const performancesState = section("performances")
  const speedrunsState = section("speedruns")
  const statisticsState = section("statistics")
  const bossesState = section("bosses")
  const spreadCard = (
    <Card title={`Typical ${roleLabel} parse by spec`} action={{ label: "Box plot", onClick: () => onStatistics("specs") }}>
      {filled(data.specSpreads, statisticsState, (rows) => <SpecSpreads rows={rows.slice(0, SPEC_SPREAD_ROWS)} />, SPEC_SPREAD_ROWS, "Could not load statistics")}
    </Card>
  )

  // A class view swaps out guild results (speed, guild Renown) for how the class's specs fare.
  const cohort = kind === "class" || kind === "spec"
  const cohortName = scope.spec ? `${scope.spec} ${CLASS_DISPLAY[scope.cls!]}` : scope.cls ? CLASS_DISPLAY[scope.cls] : ""

  return (
    <div className="space-y-5">
      {cohort ? (
        data.cohorts?.length ? <CohortHero cohorts={data.cohorts} scope={scope} role={role} onScope={onScope} onRole={onRole} /> : null
      ) : (
        <SpeedHero
          instanceName={instanceName}
          scope={data.speedrunsAreClears ? {} : scope}
          set={data.speedrunsAreClears ? undefined : set}
          onOpen={() => onTab("speedruns")}
          entries={data.speedruns?.slice(0, 3)}
          pending={speedrunsState.pending}
          error={speedrunsState.error}
        />
      )}
      {scope.boss && <BossStats boss={data.boss ?? { boss: scope.boss }} />}

      {noRole ? (
        <div className="rounded-xl border bg-card px-4 py-10 text-center text-sm text-muted-foreground">
          This class has no {role === "dps" ? "damage" : "healing"} specs. Switch the role to see its boards.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
          {/* Filled row by row, so each pair of cards shares a top edge and height. */}
          <Card title={`${guilds ? "Guild Ratings" : "Ratings"} · ${where}`} action={{ label: "Ratings", onClick: () => onRatings("overview") }}>
            {ratingsState.error ? (
              <Empty error text="Could not load ratings" />
            ) : ratingsState.pending ? (
              <MetricColumns onOpen={onRatings} />
            ) : guilds ? (
              // A guild run is rated like a player's parse: its time against the fastest.
              data.guildRatings ? <GuildRatingLeaders ratings={data.guildRatings} onOpen={onRatings} /> : <Empty />
            ) : data.ratings ? (
              <RatingLeaders leaders={data.ratings} role={role} onOpen={onRatings} />
            ) : (
              <Empty />
            )}
          </Card>
          {cohort ? (
            <Card
              title={`Where ${cohortName} stands · ${where}`}
              action={{ label: "Box plot", onClick: () => onStatistics("specs") }}
              className="lg:row-span-2"
            >
              {filled(data.specSpreads, statisticsState, (rows) => (
                <SpecStandingList rows={rows} scope={scope} onPick={(cls, spec, subSpec) => onScope({ boss: scope.boss, cls, spec, subSpec })} />
              ), SPEC_SPREAD_ROWS, "Could not load statistics")}
            </Card>
          ) : guilds ? (
            // Renown is already a column of Guild Ratings; this slot counts clears instead.
            <Card
              title={`${scope.boss || set ? "Kills" : "# Clears"} by guild · ${where}`}
              action={{ label: "Speedruns", onClick: () => onTab("speedruns") }}
            >
              {filled(data.guildClears, pending, (rows) => <GuildList rows={rows} format={(v) => String(v)} bars />)}
            </Card>
          ) : (
            <Card title={`Guild Renown · ${where}`} metric="renown" action={{ label: "Renown", onClick: () => onGuildRatings("renown") }}>
              {filled(data.guildRenown, ratingsState, (rows) => (
                <GuildList rows={rows.slice(0, GUILD_RENOWN_ROWS)} format={(v) => v.toLocaleString()} bars showDetail accent={METRIC_THEMES.renown.accent} />
              ), GUILD_RENOWN_ROWS, "Could not load ratings")}
              <button
                type="button"
                onClick={() => onGuildRatings("renown")}
                className="mt-auto flex cursor-pointer items-center gap-1 border-t border-white/5 px-4 py-2.5 text-xs font-medium transition-colors hover:bg-white/[.04] hover:underline"
                style={{ color: METRIC_THEMES.renown.accent }}
              >
                Full {METRIC_THEMES.renown.label} board
                <ArrowRight className="size-3" />
              </button>
            </Card>
          )}
          {guilds ? (
            // A guild's performance is its run: best clear time, best kill time, or best total over a set.
            <Card
              title={`Best Performances (${set ? "Total kill time" : scope.boss ? "Kill time" : "Clear time"}) · ${where}`}
              action={{ label: "Speedruns", onClick: () => onTab("speedruns") }}
            >
              {filled(data.speedruns, speedrunsState, (runs) => <RunList runs={runs} />, PERFORMANCE_ROWS, "Could not load speedruns")}
            </Card>
          ) : (
            <Card title={`Best Performances (${roleLabel}) · ${where}`} action={{ label: "Performances", onClick: () => onTab("performances") }}>
              {filled(data.performances, performancesState, (rows) => <ThroughputList rows={rows.slice(0, PERFORMANCE_ROWS)} />, PERFORMANCE_ROWS, "Could not load best performances")}
            </Card>
          )}
          {guilds ? (
            <Card
              title={`Typical ${set ? "total kill time" : scope.boss ? "kill time" : "clear time"} by guild · ${where}`}
              action={{ label: "Kill times", onClick: () => onStatistics("killtimes") }}
            >
              {filled(data.guildTimeSpreads, pending, (spreads) => <GuildSpreads spreads={spreads} />)}
            </Card>
          ) : (
            !cohort && spreadCard
          )}
        </div>
      )}

      {!scope.boss && data.bosses && bossesState.error && (
        <p role="alert" className="rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground">
          Boss cards are available, but their statistics could not be loaded.
        </p>
      )}
      {!scope.boss && !data.bosses && pending && <BossGridSkeleton />}
      {!scope.boss && data.bosses && (
        <BossGrid role={role} only={set} onBoss={(boss) => onScope({ ...scope, boss })} summaries={data.bosses} optionalBosses={data.optionalBosses} />
      )}
    </div>
  )
}

/**
 * Class overview headline, in the speed podium's place: a card per spec (or
 * per subspec once a spec with subspecs is chosen). Clicking narrows to it.
 */
function CohortHero({
  cohorts: list,
  scope,
  role,
  onScope,
  onRole,
}: {
  cohorts: readonly Cohort[]
  scope: RatingScope
  role: HubRole
  onScope: (scope: RatingScope) => void
  onRole: (role: HubRole) => void
}) {
  const single = list.length === 1
  return (
    <section
      aria-label="Specs"
      className={cn("grid gap-4", !single && "sm:grid-cols-2", list.length === 3 && "xl:grid-cols-3", list.length >= 4 && "xl:grid-cols-4")}
    >
      {list.map((c) => {
        const current = single || (c.role === role && scope.spec === c.spec && (!c.subSpec || scope.subSpec === c.subSpec))
        const narrow = { boss: scope.boss, cls: c.cls, spec: c.spec, subSpec: c.subSpec }
        return (
          <CohortCard
            key={c.role + c.spec + (c.subSpec ?? "")}
            cohort={c}
            offRole={c.role !== role}
            current={current}
            onOpen={
              single
                ? undefined
                : () => {
                    // A spec from the other role switches the role with it.
                    if (c.role !== role) onRole(c.role)
                    onScope(narrow)
                  }
            }
          />
        )
      })}
    </section>
  )
}

function CohortCard({ cohort: c, offRole, current, onOpen }: { cohort: Cohort; offRole: boolean; current: boolean; onOpen?: () => void }) {
  const color = CLASS_CSS_VAR[c.cls]
  const unit = c.role === "dps" ? "DPS" : "HPS"
  const name = specName(c)
  const body = (
    <>
      {/* The spec icon, large and faded, stands in for the boss model. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-8 -right-8 -z-10 size-44 opacity-[.16] transition-opacity group-hover:opacity-30"
        style={{
          maskImage: "radial-gradient(circle, black 20%, transparent 68%)",
          WebkitMaskImage: "radial-gradient(circle, black 20%, transparent 68%)",
        }}
      >
        <SpecIcon cls={c.cls} spec={c.spec} className="size-full" />
      </span>
      <div
        aria-hidden
        className="absolute inset-0 -z-20"
        style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${color} 14%, transparent), transparent 65%)` }}
      />
      <div className="flex items-center gap-3">
        <SpecIcon cls={c.cls} spec={c.spec} className="size-9 shrink-0 rounded-md" />
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate font-wow text-xl leading-tight" style={{ color }}>
              {name}
            </span>
            {offRole && (
              <span className="shrink-0 rounded border border-white/15 px-1 py-px text-[9px] font-medium tracking-wider text-muted-foreground uppercase">
                {c.role === "healing" ? "Healing" : "DPS"}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">{c.characters.toLocaleString()}</span> {c.charactersLabel ?? "ranked characters"}
          </div>
        </div>
      </div>
      {/* The headline is the spec's median and where it ranks; leaders sit below in the boss cards' row style. */}
      <div className="mt-3 flex items-baseline gap-2" title={`Ranked by median ${unit}: ${ordinal(c.rank)} of ${c.of} ${unit} specs`}>
        <span className="font-mono text-2xl tabular-nums">{c.median}/s</span>
        <span className="text-xs text-muted-foreground">
          median {unit} · <span className="text-foreground">{ordinal(c.rank)}</span> of {c.of}
        </span>
      </div>
      <dl className="-mx-1.5 mt-2 text-xs">
        <BossStat
          icon={<METRIC_THEMES.peak.icon className="size-3.5" style={{ color: METRIC_THEMES.peak.accent }} />}
          label="#1 Peak"
          value={c.peak ? peakWithRaw(c.peak.score, c.peak.raw, c.role === "dps" ? "dps" : "hps") : "—"}
        >
          {c.peak && (
            <span className="truncate" style={{ color }}>
              {c.peak.player.name}
            </span>
          )}
        </BossStat>
        <BossStat
          icon={c.role === "dps" ? <Swords className="size-3.5 text-muted-foreground" /> : <HeartPulse className="size-3.5 text-muted-foreground" />}
          label={`Best performance (${unit})`}
          value={c.best ? `${c.best.value}/s` : "—"}
        >
          {c.best && (
            <span className="truncate" style={{ color }}>
              {c.best.player.name}
            </span>
          )}
        </BossStat>
      </dl>
    </>
  )
  const frame = "group @container relative isolate overflow-hidden rounded-xl border bg-card p-4 text-left"
  return onOpen ? (
    <button
      type="button"
      onClick={onOpen}
      aria-label={name}
      aria-pressed={current}
      className={cn(frame, "cursor-pointer transition-colors hover:border-white/25")}
      style={current ? { borderColor: color } : undefined}
    >
      {body}
    </button>
  ) : (
    <section aria-label={name} className={frame}>
      {body}
    </section>
  )
}

function ordinal(n: number) {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")
  return `${n}${suffix}`
}

/** "Feral (Cat)": a subspec reads as a spec of its own. */
function specName(s: { spec: string; subSpec?: string }) {
  return s.subSpec ? `${s.spec} (${s.subSpec})` : s.spec
}

/** Healers share spec names (Holy, Restoration); add the class when a name repeats in the list. */
function specLabel(s: { cls: string; spec: string; subSpec?: string }, rows: readonly { spec: string }[]) {
  return rows.filter((r) => r.spec === s.spec).length > 1 && !s.subSpec ? `${s.spec} ${CLASS_DISPLAY[s.cls]}` : specName(s)
}

/**
 * Every spec in the role, ranked by median parse, with the chosen class lit
 * and the rest dimmed: is this class good here? Any row opens that spec.
 */
function SpecStandingList({
  rows,
  scope,
  onPick,
}: {
  rows: readonly SpecSpread[]
  scope: RatingScope
  onPick: (cls: string, spec: string, subSpec?: string) => void
}) {
  const lo = Math.min(...rows.map((r) => r.min))
  const hi = Math.max(...rows.map((r) => r.max))
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  return (
    <ol className="flex flex-1 flex-col justify-around px-2 py-2">
      {rows.map((s, i) => {
        const color = CLASS_CSS_VAR[s.cls]
        const mine = s.cls === scope.cls && (!scope.spec || s.spec === scope.spec) && (!scope.subSpec || s.subSpec === scope.subSpec)
        return (
          <li key={`${s.cls}-${s.spec}-${s.subSpec ?? ""}`}>
            <button
              type="button"
              onClick={() => onPick(s.cls, s.spec, s.subSpec)}
              title={`${specName(s)} ${CLASS_DISPLAY[s.cls]}: #${i + 1}, median ${s.median}`}
              className={cn(
                "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1 transition-opacity hover:bg-white/[.04] hover:opacity-100",
                mine ? "bg-white/[.04]" : "opacity-40",
              )}
              style={mine ? { boxShadow: `inset 2px 0 0 ${color}` } : undefined}
            >
              <span className="w-5 text-right font-mono text-[11px] text-muted-foreground">{i + 1}</span>
              <span className="flex w-36 min-w-0 items-center gap-1.5 text-xs" style={{ color }}>
                <SpecIcon cls={s.cls} spec={s.spec} className="size-4 shrink-0 rounded-sm" />
                <span className={cn("truncate", mine && "font-semibold")}>{specLabel(s, rows)}</span>
              </span>
              <span className="relative h-2.5 flex-1">
                <span
                  className="absolute top-1/2 h-px -translate-y-1/2 opacity-50"
                  style={{ left: `${pct(s.min)}%`, width: `${pct(s.max) - pct(s.min)}%`, backgroundColor: color }}
                />
                <span
                  className="absolute inset-y-0 rounded-xs opacity-70"
                  style={{ left: `${pct(s.q1)}%`, width: `${pct(s.q3) - pct(s.q1)}%`, backgroundColor: color }}
                />
                <span className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${pct(s.median)}%` }} />
              </span>
              <span className={cn("w-9 text-right font-mono text-xs", mine ? "text-foreground" : "text-muted-foreground")}>{s.median}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function SpeedHero({
  instanceName,
  scope,
  set,
  onOpen,
  entries,
  pending,
  error,
}: {
  instanceName: string
  scope: RatingScope
  set?: readonly string[]
  onOpen: () => void
  entries?: readonly SpeedrunLeaderboardEntry[]
  error?: boolean
  pending?: boolean
}) {
  return (
    <section
      className="relative overflow-hidden rounded-xl border bg-cover bg-center"
      style={{ backgroundImage: `url('${getInstanceBackground(instanceName)}')` }}
    >
      <div className="absolute inset-0 bg-background/80" />
      <span className="absolute top-3 left-4 z-10 text-xs font-medium text-muted-foreground">
        {set ? `Fastest total kill time · ${set.length} bosses` : scope.boss ? `Fastest ${scope.boss} kills` : "Fastest full clears"}
      </span>
      <CardLink label="Speedruns" onClick={onOpen} className="absolute top-3 right-4 z-10" />
      {entries?.length ? (
        <>
          <div className="relative px-4 pt-9 pb-2 sm:hidden">
            <PodiumList entries={[...entries]} instanceName={instanceName} />
          </div>
          <div className="relative hidden px-4 pt-10 sm:block">
            <Podium entries={[...entries]} instanceName={instanceName} />
          </div>
        </>
      ) : error ? (
        <p role="alert" className="relative px-4 pt-10 pb-8 text-center text-sm text-muted-foreground">
          Could not load speedruns
        </p>
      ) : pending ? (
        // The podium's three steps, second / first / third.
        <div role="status" aria-label="Loading" className="relative flex items-end justify-center gap-4 px-4 pt-10 pb-6">
          {["h-28", "h-36", "h-24"].map((h, i) => (
            <span key={i} className={cn("w-24 animate-pulse rounded-xl bg-white/[.06] sm:w-40", h)} />
          ))}
        </div>
      ) : (
        <p className="relative px-4 pt-10 pb-8 text-center text-sm text-muted-foreground">
          {entries ? "No qualifying runs yet" : "Not published for this selection yet"}
        </p>
      )}
    </section>
  )
}

export type LiveBossSummary = Pick<BossSummary, "boss"> & Partial<Omit<BossSummary, "boss">> & { topDps?: number }

export function BossStats({ boss }: { boss: LiveBossSummary }) {
  const rate = boss.kills !== undefined && boss.attempts ? (boss.kills / boss.attempts) * 100 : undefined
  const stats = [
    { label: "Success rate", value: rate === undefined ? "—" : `${rate.toFixed(0)}%`, bar: rate },
    { label: "Kills / pulls", value: boss.kills !== undefined && boss.attempts !== undefined ? `${boss.kills.toLocaleString()} / ${boss.attempts.toLocaleString()}` : "—" },
    { label: "Median kill", value: boss.medianKillMs === undefined ? "—" : formatClock(boss.medianKillMs) },
    // The speed podium above already names the fastest kill, so a phone skips it.
    { label: "Fastest kill", value: boss.best ? formatClock(boss.best.ms) : "—", sub: boss.best?.guild, desktopOnly: true },
  ]
  return (
    // Supplementary numbers: one compact row on a phone, roomier cells from sm up.
    <section aria-label={`${boss.boss} stats`} className="grid grid-cols-3 divide-x overflow-hidden rounded-xl border bg-card sm:grid-cols-4">
      {stats.map((s) => (
        <div key={s.label} className={cn("min-w-0 px-3 py-2 sm:px-4 sm:py-3", s.desktopOnly && "hidden sm:block")}>
          <div className="truncate text-[10px] tracking-wider text-muted-foreground uppercase sm:text-[11px]">{s.label}</div>
          <div className="mt-0.5 truncate font-mono text-sm tabular-nums sm:text-xl">{s.value}</div>
          {s.bar !== undefined && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-red-500/30 sm:mt-1.5 sm:h-1.5">
              <div className="h-full bg-green-500/70" style={{ width: `${s.bar}%` }} />
            </div>
          )}
          {s.sub && <div className="text-xs text-muted-foreground">{s.sub}</div>}
        </div>
      ))}
    </section>
  )
}

/** One card per boss, its model standing behind the stats: the raid overview's answer to "MC has twelve bosses". */
export function BossGrid({
  role,
  only,
  onBoss,
  summaries,
  optionalBosses,
}: {
  role: HubRole
  /** Limit to a combined set of bosses. */
  only?: readonly string[]
  onBoss: (boss: string) => void
  summaries: readonly LiveBossSummary[]
  optionalBosses?: ReadonlySet<string>
}) {
  const rows = summaries.filter((b) => !only || only.includes(b.boss))
  const optionalSet = optionalBosses ?? new Set<string>()
  const required = rows.filter((b) => !optionalSet.has(b.boss))
  const optional = rows.filter((b) => optionalSet.has(b.boss))
  const grid = (list: LiveBossSummary[], isOptional: boolean) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {list.map((b) => (
        <BossCard key={b.boss} summary={b} role={role} optional={isOptional} onOpen={() => onBoss(b.boss)} />
      ))}
    </div>
  )
  return (
    <section aria-label="Bosses" className="space-y-3">
      <h2 className="px-1 text-sm font-semibold">Bosses</h2>
      {grid(required, false)}
      {optional.length > 0 && (
        <section aria-label="Optional bosses" className="space-y-3 pt-3">
          <div className="flex items-center gap-3 px-1">
            <h3 className="text-sm font-semibold text-muted-foreground">Optional bosses</h3>
            <span className="text-xs text-muted-foreground/70">Not needed for a full clear</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          {grid(optional, true)}
        </section>
      )}
    </section>
  )
}

function BossCard({ summary: b, role, optional, onOpen }: { summary: LiveBossSummary; role: HubRole; optional: boolean; onOpen: () => void }) {
  const rate = b.kills !== undefined && b.attempts ? (b.kills / b.attempts) * 100 : undefined
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={b.boss}
      className={cn(
        "group relative isolate flex cursor-pointer flex-col overflow-hidden rounded-xl border text-left transition-colors hover:border-white/20",
        // Optional bosses read as secondary: dashed frame, darker card, muted portrait.
        optional ? "border-dashed bg-card/40" : "bg-card",
      )}
    >
      <div aria-hidden className="absolute inset-y-0 right-0 -z-10 w-1/2">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_65%_45%,rgba(255,255,255,.08),transparent_70%)]" />
        <span className={cn("absolute top-3 right-3 opacity-60", optional && "opacity-40 grayscale")}>
          <BossPortrait boss={b.boss} size="lg" />
        </span>
      </div>

      <div className="w-[56%] px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn("truncate font-wow text-lg leading-tight group-hover:text-primary", optional && "text-foreground/75")}>{b.boss}</span>
          {optional && (
            <span className="shrink-0 rounded border border-white/15 px-1 py-px text-[9px] font-medium tracking-wider text-muted-foreground uppercase">
              Optional
            </span>
          )}
        </div>
        {(rate !== undefined || b.medianKillMs !== undefined) && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {rate !== undefined && (
              <>
                <span className="h-1 w-10 overflow-hidden rounded-full bg-red-500/30">
                  <span className="block h-full bg-green-500/70" style={{ width: `${rate}%` }} />
                </span>
                <span className="font-mono tabular-nums">{rate.toFixed(0)}%</span>
              </>
            )}
            {b.medianKillMs !== undefined && (
              <>
                {rate !== undefined && <span>·</span>}
                <span className="font-mono tabular-nums">{formatClock(b.medianKillMs)}</span>
                <span>median</span>
              </>
            )}
          </div>
        )}
      </div>
      <dl className="w-[56%] space-y-0.5 px-3 pb-3 text-xs">
        {b.standing ? (
          // With a class chosen, the guild's fastest kill gives way to where the class's best spec ranks here.
          <BossStat
            icon={<SpecIcon cls={b.standing.cls} spec={b.standing.spec} className="size-3.5 rounded-xs" />}
            label={`${specName(b.standing)} rank by median ${role === "dps" ? "DPS" : "HPS"}`}
            value={`${b.standing.median}/s`}
          >
            <span className="truncate" style={{ color: CLASS_CSS_VAR[b.standing.cls] }}>
              {specName(b.standing)}
            </span>
            <span className="shrink-0 text-muted-foreground">
              #{b.standing.rank}
              <span className="text-muted-foreground/60">/{b.standing.of}</span>
            </span>
          </BossStat>
        ) : b.best ? (
          <BossStat icon={<Timer className="size-3.5 text-muted-foreground" />} label="Fastest" value={formatClock(b.best.ms)}>
            <span className="truncate text-muted-foreground">{b.best.guild}</span>
          </BossStat>
        ) : null}
        {RATING_METRICS.map((m) => {
          const t = METRIC_THEMES[m]
          const leader = b.ratings?.[m]
          return (
            <BossStat
              key={m}
              icon={<t.icon className="size-3.5" style={{ color: t.accent }} />}
              label={t.label}
              value={leader ? t.format(leader.score) : "—"}
              // Peak's DPS stacks under the score so the name keeps its room.
              sub={leader?.raw ? `${Math.round(leader.raw).toLocaleString()}/s` : undefined}
            >
              {leader && <PlayerName player={leader.player} />}
            </BossStat>
          )
        })}
        <BossStat
          icon={role === "dps" ? <Swords className="size-3.5 text-muted-foreground" /> : <HeartPulse className="size-3.5 text-muted-foreground" />}
          label={`Best performance (${role === "dps" ? "DPS" : "HPS"})`}
          value={b.performance ? `${b.performance.value.toLocaleString()}/s` : role === "dps" && b.topDps !== undefined ? `${Math.round(b.topDps).toLocaleString()}/s` : "—"}
        >
          {b.performance && <PlayerName player={b.performance.player} />}
        </BossStat>
      </dl>
    </button>
  )
}

function BossStat({ icon, label, value, sub, children }: { icon: ReactNode; label: string; value: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded px-1.5 py-1 [text-shadow:0_1px_2px_rgba(0,0,0,.8)]">
      <dt className="shrink-0" title={label}>
        {icon}
        <span className="sr-only">{label}</span>
      </dt>
      <dd className="flex min-w-0 flex-1 items-center gap-1.5 truncate">{children}</dd>
      <dd className="shrink-0 text-right font-mono tabular-nums">
        {value}
        {sub && <span className="block text-[9px] leading-tight text-muted-foreground">{sub}</span>}
      </dd>
    </div>
  )
}

function PlayerName({ player, iconSize = "size-4" }: { player: HubPlayer; iconSize?: string }) {
  const attributes = player.realm
    ? entityAttributes({ kind: "character", realm: player.realm, guid: player.id, name: player.name, className: player.cls })
    : {}
  return (
    <>
      <SpecIcon cls={player.cls} spec={player.spec} className={`${iconSize} shrink-0 rounded-sm`} />
      <span className="truncate" style={{ color: CLASS_CSS_VAR[player.cls] }} {...attributes}>
        {player.name}
      </span>
    </>
  )
}

function RatingLeaders({ leaders, role, onOpen }: { leaders: Record<RatingMetric, RatingLeader[]>; role: HubRole; onOpen: (metric: RatingMetric) => void }) {
  const rows = (m: RatingMetric) =>
    leaders[m].map((l) => ({
      id: JSON.stringify([l.player.realm,l.player.id,l.player.cls,l.player.spec,l.player.subSpec]),
      name: <PlayerName player={l.player} iconSize="size-5" />,
      score: l.score,
      raw: l.raw ? formatPeakRaw(l.raw, role === "dps" ? "dps" : "hps") : undefined,
    }))
  return <MetricColumns columns={{ peak: rows("peak"), mastery: rows("mastery"), renown: rows("renown") }} onOpen={onOpen} />
}

/** A guild's best runs, fastest first: the guild counterpart of a player's best parses. */
function RunList({ runs }: { runs: readonly SpeedrunLeaderboardEntry[] }) {
  return (
    <ol>
      {runs.map((r, i) => (
        <li
          key={r.instance_id}
          className="grid grid-cols-[24px_1fr_70px] items-center gap-2 border-b border-white/5 px-4 py-2 text-sm last:border-b-0 md:grid-cols-[24px_1fr_70px_1fr]"
        >
          <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <GuildName guild={r.guild_name} guildId={r.guild_id} logo={r.guild_logo_url} />
          </span>
          <span className="text-right font-mono font-bold tabular-nums">{formatClock(r.duration_ms)}</span>
          <span className="hidden truncate text-right text-xs text-muted-foreground md:block">
            {r.player_count} players ·{" "}
            {new Date(r.completion_time).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}
          </span>
        </li>
      ))}
    </ol>
  )
}

function ThroughputList({ rows }: { rows: readonly ThroughputRow[] }) {
  return (
    <ol>
      {rows.map((r, i) => (
        <li
          key={JSON.stringify([r.player.realm,r.player.id,r.player.cls,r.player.spec,r.player.subSpec])}
          className="grid grid-cols-[24px_1fr_70px] items-center gap-2 border-b border-white/5 px-4 py-2 text-sm last:border-b-0 md:grid-cols-[24px_1fr_120px_70px_1fr]"
        >
          <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
          <span className="flex min-w-0 items-center gap-2 font-medium">
            <PlayerName player={r.player} iconSize="size-5" />
          </span>
          <span className="hidden truncate text-xs opacity-80 md:block" style={{ color: CLASS_CSS_VAR[r.player.cls] }}>
            {r.player.subSpec ? specName(r.player) : r.player.spec}
          </span>
          <span className="text-right font-mono font-bold tabular-nums">{r.value}/s</span>
          <span className="hidden truncate text-right text-xs text-muted-foreground md:block">{r.player.guild}</span>
        </li>
      ))}
    </ol>
  )
}

function GuildList({
  rows,
  format,
  bars,
  showDetail = !bars,
  accent,
}: {
  rows: readonly GuildRow[]
  format: (v: number) => string
  bars?: boolean
  showDetail?: boolean
  /** Bar color; defaults to the site primary. */
  accent?: string
}) {
  const max = rows[0]?.value ?? 1
  return (
    <ol>
      {rows.map((g, i) => (
        <li key={g.guild} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 text-sm last:border-b-0">
          <span className="w-4 font-mono text-xs text-muted-foreground">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2 font-medium">
              <GuildName guild={g.guild} guildId={g.guildId} logo={g.logo} />
            </span>
            {showDetail && g.detail && <span className="block text-[11px] text-muted-foreground">{g.detail}</span>}
          </span>
          {bars && (
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <span className="block h-full bg-primary" style={{ width: `${(g.value / max) * 100}%`, backgroundColor: accent }} />
            </span>
          )}
          <span className="w-16 text-right font-mono text-xs font-bold tabular-nums">{format(g.value)}</span>
        </li>
      ))}
    </ol>
  )
}

/**
 * Each guild's run times as a box plot, fastest median first. Shorter is
 * better, so the axis runs fast (left) to slow (right); a tight box is a
 * guild that clears the same way every week.
 */
function GuildSpreads({ spreads }: { spreads: readonly GuildTimeSpread[] }) {
  const lo = Math.min(...spreads.map((s) => s.min))
  const hi = Math.max(...spreads.map((s) => s.max))
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  const color = GUILD_GOLD
  return (
    <div className="flex flex-1 flex-col justify-around px-4 py-3">
      {spreads.map((s) => (
        <div
          key={s.guild}
          className="flex items-center gap-2.5 py-1.5"
          title={`${s.guild}: best ${formatClock(s.min)}, typical ${formatClock(s.median)}, slowest ${formatClock(s.max)} over ${s.runs} runs`}
        >
          <span className="flex w-36 min-w-0 items-center gap-1.5 text-xs">
            <GuildName guild={s.guild} logo={s.logo} size="size-4" />
          </span>
          <div className="relative h-3 flex-1">
            <div
              className="absolute top-1/2 h-px -translate-y-1/2 opacity-50"
              style={{ left: `${pct(s.min)}%`, width: `${pct(s.max) - pct(s.min)}%`, backgroundColor: color }}
            />
            <div
              className="absolute inset-y-0 rounded-xs opacity-60"
              style={{ left: `${pct(s.q1)}%`, width: `${pct(s.q3) - pct(s.q1)}%`, backgroundColor: color }}
            />
            <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${pct(s.median)}%` }} />
          </div>
          <span className="w-11 text-right font-mono text-xs text-muted-foreground">{formatClock(s.median)}</span>
        </div>
      ))}
    </div>
  )
}

function SpecSpreads({ rows }: { rows: readonly SpecSpread[] }) {
  const lo = Math.min(...rows.map((r) => r.min))
  const hi = Math.max(...rows.map((r) => r.max))
  const pct = (v: number) => ((v - lo) / (hi - lo || 1)) * 100
  // Rows spread over the card's full height so it lines up with its row partner.
  return (
    <div className="flex flex-1 flex-col justify-around px-4 py-3">
      {rows.map((s) => {
        const color = CLASS_CSS_VAR[s.cls]
        return (
          <div key={`${s.cls}-${s.spec}-${s.subSpec ?? ""}`} className="flex items-center gap-2.5 py-1.5">
            <span className="flex w-36 min-w-0 items-center gap-1.5 text-xs" style={{ color }}>
              <SpecIcon cls={s.cls} spec={s.spec} className="size-4 shrink-0 rounded-sm" />
              <span className="truncate">{specLabel(s, rows)}</span>
            </span>
            <div className="relative h-3 flex-1">
              <div
                className="absolute top-1/2 h-px -translate-y-1/2 opacity-50"
                style={{ left: `${pct(s.min)}%`, width: `${pct(s.max) - pct(s.min)}%`, backgroundColor: color }}
              />
              <div
                className="absolute inset-y-0 rounded-xs opacity-70"
                style={{ left: `${pct(s.q1)}%`, width: `${pct(s.q3) - pct(s.q1)}%`, backgroundColor: color }}
              />
              <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: `${pct(s.median)}%` }} />
            </div>
            <span className="w-10 text-right font-mono text-xs text-muted-foreground">{s.median}</span>
          </div>
        )
      })}
    </div>
  )
}

export function Card({
  title,
  action,
  metric,
  className,
  children,
}: {
  title: string
  className?: string
  action?: { label: string; onClick: () => void }
  /** Marks the card as a rating metric's card: its icon, and an accent line under the header. */
  metric?: RatingMetric
  children: ReactNode
}) {
  const theme = metric ? METRIC_THEMES[metric] : undefined
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <div
        className="flex items-center justify-between border-b bg-black/10 px-4 py-3"
        style={theme ? { boxShadow: `inset 0 -2px 0 ${theme.accent}` } : undefined}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {theme && <theme.icon className="size-4" style={{ color: theme.accent }} aria-hidden />}
          {title}
        </h2>
        {action && <CardLink label={action.label} onClick={action.onClick} />}
      </div>
      {children}
    </section>
  )
}

export function CardLink({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("cursor-pointer inline-flex items-center gap-1 text-xs text-primary hover:underline", className)}
    >
      {label}
      <ArrowRight className="size-3" />
    </button>
  )
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  /** `color` tints the chosen option so the choice reads at a glance. */
  options: { value: T; label: string; color?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="flex rounded-md border bg-background/60 p-0.5 text-xs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded px-2.5 py-1.5 font-medium transition-colors",
            value === o.value ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
          style={
            value === o.value && o.color
              ? {
                  color: o.color,
                  backgroundColor: `color-mix(in srgb, ${o.color} 16%, transparent)`,
                  boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${o.color} 45%, transparent)`,
                }
              : undefined
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function TabPlaceholder({ tab, title }: { tab: HubTab; title: string }) {
  const t = TABS.find((x) => x.id === tab)!
  return (
    <div className="rounded-xl border border-dashed bg-card/40 px-6 py-16 text-center">
      <t.icon className="mx-auto size-8 text-primary" />
      <h2 className="mt-3 font-wow text-xl">
        {t.label} · {title}
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Full boards for this tab, scoped by the picker bar above: {t.holds}</p>
    </div>
  )
}
