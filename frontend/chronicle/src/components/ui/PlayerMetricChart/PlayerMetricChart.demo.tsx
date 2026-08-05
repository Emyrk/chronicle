import { useCallback } from 'react'
import { ChevronDown, ChevronLeft, ExternalLink, Filter, Focus, HelpCircle, Layers, MoreVertical, Swords, X } from 'lucide-react'
import {
  AbilityBreakout,
  BreakoutHoverProvider,
  type AbilityData,
  type BreakoutTab,
  type ExpandedViewMode,
  type TargetData,
} from '@/components/ui/AbilityBreakout'
import {
  AbilityBreakdownTable,
  PlayerMetricChart,
  type AbilityBreakdown,
  type ParsePillData,
  type PlayerMetricChartData,
} from './PlayerMetricChart'

const durationMillis = 210_000

const players: PlayerMetricChartData[] = [
  { playerID: 'player-1', playerName: 'Shadowmeld', className: 'Rogue', specialization: 'Combat', value: 140_000 },
  { playerID: 'player-2', playerName: 'Ragesmash', className: 'Warrior', specialization: 'Fury', value: 111_000 },
  { playerID: 'player-3', playerName: 'Blazewing', className: 'Mage', specialization: 'Fire', value: 105_000 },
  { playerID: 'player-4', playerName: 'Afflicted', className: 'Warlock', specialization: 'Affliction', value: 101_000 },
  { playerID: 'player-5', playerName: 'Markshot', className: 'Hunter', specialization: 'Marksmanship', value: 91_000 },
]

const abilities: Record<string, AbilityBreakdown[]> = {
  'player-1': [
    { name: 'Sinister Strike', totalDamage: 54_000, hitCount: 70, critCount: 22, missCount: 4, dodgeCount: 2, immuneCount: 0, parryCount: 1, otherCount: 0 },
    { name: 'Auto Attack', totalDamage: 46_000, hitCount: 160, critCount: 51, missCount: 11, dodgeCount: 3, immuneCount: 0, parryCount: 2, otherCount: 5 },
    { name: 'Eviscerate', totalDamage: 28_000, hitCount: 18, critCount: 9, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Blade Flurry', totalDamage: 12_000, hitCount: 28, critCount: 7, missCount: 0, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
  'player-2': [
    { name: 'Bloodthirst', totalDamage: 39_000, hitCount: 34, critCount: 14, missCount: 2, dodgeCount: 1, immuneCount: 0, parryCount: 1, otherCount: 0 },
    { name: 'Auto Attack', totalDamage: 35_000, hitCount: 121, critCount: 36, missCount: 9, dodgeCount: 3, immuneCount: 0, parryCount: 2, otherCount: 4 },
    { name: 'Whirlwind', totalDamage: 25_000, hitCount: 27, critCount: 10, missCount: 1, dodgeCount: 1, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
  'player-3': [
    { name: 'Fireball', totalDamage: 58_000, hitCount: 31, critCount: 12, missCount: 3, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Fire Blast', totalDamage: 20_000, hitCount: 12, critCount: 5, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Ignite', totalDamage: 15_000, hitCount: 18, critCount: 0, missCount: 0, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
  'player-4': [
    { name: 'Shadow Bolt', totalDamage: 48_000, hitCount: 30, critCount: 9, missCount: 3, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Corruption', totalDamage: 24_000, hitCount: 54, critCount: 0, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Immolate', totalDamage: 17_000, hitCount: 20, critCount: 4, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Curse of Agony', totalDamage: 12_000, hitCount: 38, critCount: 0, missCount: 0, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
  'player-5': [
    { name: 'Auto Shot', totalDamage: 35_000, hitCount: 150, critCount: 45, missCount: 12, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 3 },
    { name: 'Aimed Shot', totalDamage: 28_000, hitCount: 25, critCount: 15, missCount: 2, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Multi-Shot', totalDamage: 18_000, hitCount: 35, critCount: 12, missCount: 3, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
}

/** Detailed-breakout state for the full tabbed AbilityBreakout (drives the explainer videos). */
export interface DemoBreakoutDetail {
  expanded?: boolean
  viewMode?: ExpandedViewMode
  tab?: BreakoutTab
}

/**
 * Rank-split view of a player's abilities (what the Ranks toggle shows).
 * Rows sum to the merged rows above; subtitles mirror the app's rank subtext.
 * Only Blazewing needs one — the ranks lesson video pins that breakout.
 */
const RANKED_ABILITIES: Record<string, Array<AbilityBreakdown & { subtitle?: string }>> = {
  'player-3': [
    { name: 'Fireball', subtitle: 'Rank 12', totalDamage: 36_000, hitCount: 19, critCount: 8, missCount: 2, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Fireball', subtitle: 'Rank 11', totalDamage: 22_000, hitCount: 12, critCount: 4, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Fire Blast', subtitle: 'Rank 7', totalDamage: 20_000, hitCount: 12, critCount: 5, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Ignite', totalDamage: 15_000, hitCount: 18, critCount: 0, missCount: 0, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
  ],
}

/** An extra demo player (with abilities) appended to the standard roster. */
export interface DemoExtraPlayer {
  player: PlayerMetricChartData
  abilities: AbilityBreakdown[]
}

/** Cross-breakout hover/selection state (drives the compare-abilities video). */
export interface DemoBreakoutHover {
  /** Hovered ability row, mirrored in every open breakout. */
  rowId?: string | null
  /** Selected ability names — footers aggregate exactly these rows. */
  selected?: string[]
}

/**
 * Filter-lesson stage: the mock context menu, the mock filter editor (the
 * panel's flip side), then the chart narrowed to Auto Attack damage only.
 */
export type DemoFilterStage = 'idle' | 'menu' | 'editor' | 'filtered'

/**
 * Focus-lesson stage: Ctrl+click's row context menu, then the focused
 * per-ability view with its Back header.
 */
export type DemoFocusStage = 'idle' | 'menu' | 'focused'

/** Ragesmash's abilities as chart rows — what Focus swaps the panel to. */
const FOCUSED_ABILITY_ROWS: PlayerMetricChartData[] = abilities['player-2'].map((a) => ({
  playerID: `focus-${a.name}`,
  playerName: a.name,
  className: 'Warrior',
  specialization: '',
  value: a.totalDamage,
}))

/** What survives an "Ability Name: Auto Attack" filter — melee auto attacks. */
const FILTERED_PLAYERS: PlayerMetricChartData[] = [
  { playerID: 'player-1', playerName: 'Shadowmeld', className: 'Rogue', specialization: 'Combat', value: 46_000 },
  { playerID: 'player-2', playerName: 'Ragesmash', className: 'Warrior', specialization: 'Fury', value: 35_000 },
]

/** Frame-driven state of the mock editor's ability-name chip input. */
export interface DemoFilterEditorState {
  /** Characters typed so far (empty = untouched input showing its placeholder). */
  typed: string
  /** Whether Enter has committed the typed name as a chip. */
  chip: boolean
  /** Caret visibility (frame-driven blink while the input is focused). */
  caret: boolean
  /** 0..1 opacity of the "↵ Enter" keycap hint shown as Enter is pressed. */
  enterFlash?: number
}

/** Mock of the PanelFilterEditor flip side — one ability-name chip input. */
export function DemoFilterEditor({
  state,
  icon = <Swords className="h-4 w-4" />,
  label = 'Damage Done',
  chipLabel = 'Auto Attack',
}: {
  state?: DemoFilterEditorState
  icon?: React.ReactNode
  label?: string
  chipLabel?: string
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-2 pt-2" data-demo-filter-editor>
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          {icon}
          {label}
        </h4>
        {/* Mirrors the editor's ghost Reset/Back buttons. */}
        <div className="flex items-center gap-2">
          <span className="rounded-md px-3 py-1.5 text-xs font-medium">Reset</span>
          <span className="rounded-md px-3 py-1.5 text-xs font-medium" data-demo-editor-close>
            Back
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-xs text-muted-foreground">Title:</span>
        <span className="flex-1 border-b border-zinc-700 px-1 py-0.5 text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2 rounded border border-zinc-700/60 bg-zinc-800/40 px-2 py-1.5">
        <span className="shrink-0 rounded bg-muted px-2 py-1 text-xs">Ability Name</span>
        {/* Mirrors AbilityNameEditor's chip input. */}
        <div
          className="flex min-h-[28px] flex-1 flex-wrap items-center gap-1 rounded border border-input bg-background/60 px-1 py-0.5"
          data-demo-filter-input
        >
          {state?.chip && (
            <span className="inline-flex items-center gap-0.5 rounded bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary">
              {chipLabel}
              <span className="ml-0.5 leading-none">×</span>
            </span>
          )}
          {!state?.chip && state?.typed && <span className="py-0.5 text-xs">{state.typed}</span>}
          {state?.caret && <span className="h-3.5 w-px bg-foreground" />}
          {!state?.chip && !state?.typed && (
            <span className="py-0.5 text-xs text-muted-foreground">ability name, press Enter</span>
          )}
          {state?.chip && <span className="py-0.5 text-xs text-muted-foreground">add more…</span>}
        </div>
        {(state?.enterFlash ?? 0) > 0 && (
          <span
            className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]"
            style={{ opacity: state?.enterFlash }}
          >
            ↵ Enter
          </span>
        )}
        <X className="h-3 w-3 shrink-0 text-muted-foreground" />
      </div>
      <button type="button" className="self-start text-xs text-muted-foreground">
        + Add filter
      </button>
      <p className="mt-auto pb-1 text-2xs leading-relaxed text-muted-foreground">
        Filters apply live — filter by ability, school, hit type, source, target, or time range.
      </p>
    </div>
  )
}

/** Upgrade a simple demo ability into the rich AbilityData the tabbed breakout renders. */
function toAbilityData(a: AbilityBreakdown & { subtitle?: string }): AbilityData {
  const count =
    a.hitCount + a.critCount + a.missCount + a.dodgeCount + a.immuneCount + a.parryCount + a.otherCount
  // Crits hit for ~2x, so per-hit averages fall out of the total deterministically.
  const weight = a.hitCount + 2 * a.critCount
  const perHit = weight > 0 ? a.totalDamage / weight : 0
  const stats = (n: number, avg: number) =>
    n > 0
      ? {
          count: n,
          total: Math.round(n * avg),
          min: Math.round(avg * 0.72),
          max: Math.round(avg * 1.31),
        }
      : undefined
  return {
    name: a.name,
    key: a.subtitle ? `${a.name} ${a.subtitle}` : a.name,
    subtitle: a.subtitle,
    value: a.totalDamage,
    Total: a.totalDamage,
    Count: count,
    Hits: a.hitCount,
    Crits: a.critCount,
    Misses: a.missCount,
    Dodges: a.dodgeCount,
    Parries: a.parryCount,
    Immunes: a.immuneCount,
    HitStats: stats(a.hitCount, perHit),
    CritStats: stats(a.critCount, perHit * 2),
  }
}

const TARGET_SHARES = [
  { targetName: 'Ragnaros', share: 0.71 },
  { targetName: 'Son of Flame', share: 0.21 },
  { targetName: 'Lava Spawn', share: 0.08 },
]

function toTargets(playerID: string, playerAbilities: AbilityBreakdown[], total: number): TargetData[] {
  const hits = playerAbilities.reduce((sum, a) => sum + a.hitCount, 0)
  const crits = playerAbilities.reduce((sum, a) => sum + a.critCount, 0)
  return TARGET_SHARES.map((t, i) => ({
    targetId: `${playerID}-target-${i}`,
    targetName: t.targetName,
    value: Math.round(total * t.share),
    hitCount: Math.round(hits * t.share),
    critCount: Math.round(crits * t.share),
  }))
}

export function PlayerMetricChartAbilityBreakdownDemo({
  pinnedPlayers,
  classIconBasePath,
  perSecond,
  parsePills,
  breakoutDetail,
  showRanks = true,
  filterStage = 'idle',
  filterEditor,
  extraPlayers,
  breakoutHover,
  focusStage = 'idle',
  focusMenuAt,
}: {
  /**
   * Controlled pinned breakouts: playerID → position (portal-container
   * coordinates). Positions may animate frame-to-frame (scripted demos);
   * adding/removing players remounts the chart to (un)pin them.
   */
  pinnedPlayers?: ReadonlyMap<string, { x: number; y: number }>
  classIconBasePath?: string
  /** Show DPS values instead of totals (drives the explainer videos). */
  perSecond?: boolean
  /** Deterministic parse pills keyed by playerID (drives the explainer videos). */
  parsePills?: Map<string, ParsePillData>
  /**
   * When set, pinned breakouts render the full tabbed AbilityBreakout
   * (More detail / min-avg-max / By Target) with this controlled state.
   */
  breakoutDetail?: DemoBreakoutDetail
  /**
   * The header's Ranks toggle (defaults on, like the app). When off, full
   * breakouts merge rank-split abilities into one row per name.
   */
  showRanks?: boolean
  /** Drives the filter lesson video: context menu → editor → filtered chart. */
  filterStage?: DemoFilterStage
  /** Typing/chip state of the editor's ability-name input (editor stage only). */
  filterEditor?: DemoFilterEditorState
  /** Extra roster entries (e.g. a second player of the same class to compare). */
  extraPlayers?: DemoExtraPlayer[]
  /** Controlled cross-breakout hover/selection (drives the compare video). */
  breakoutHover?: DemoBreakoutHover
  /** Drives the focus lesson video: Ctrl+click menu → focused ability view. */
  focusStage?: DemoFocusStage
  /** Demo-local position of the Ctrl+click context menu (menu stage only). */
  focusMenuAt?: { x: number; y: number }
}) {
  const pinnedKey = pinnedPlayers ? [...pinnedPlayers.keys()].sort().join(',') : 'unpinned'
  const roster = extraPlayers ? [...players, ...extraPlayers.map((e) => e.player)] : players
  const abilityMap: Record<string, AbilityBreakdown[]> = extraPlayers
    ? { ...abilities, ...Object.fromEntries(extraPlayers.map((e) => [e.player.playerID, e.abilities])) }
    : abilities

  const breakout = useCallback((playerID: string) => {
    const playerAbilities = abilityMap[playerID] ?? []
    const totalValue = roster.find((player) => player.playerID === playerID)?.value ?? 0
    if (breakoutDetail) {
      const source = (showRanks && RANKED_ABILITIES[playerID]) || playerAbilities
      return (
        <AbilityBreakout
          abilities={source.map(toAbilityData)}
          targets={toTargets(playerID, playerAbilities, totalValue)}
          totalValue={totalValue}
          valueLabel="Damage"
          activeTab={breakoutDetail.tab ?? 'ability'}
          onTabChange={() => {}}
          expanded={breakoutDetail.expanded ?? false}
          expandedViewMode={breakoutDetail.viewMode ?? 'percent'}
        />
      )
    }
    return (
      <AbilityBreakdownTable
        abilities={playerAbilities}
        totalValue={totalValue}
        durationMillis={durationMillis}
      />
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roster/abilityMap derive from extraPlayers
  }, [breakoutDetail, showRanks, extraPlayers])

  const filtered = filterStage === 'filtered'
  const chartData = filtered ? FILTERED_PLAYERS : roster
  const total = chartData.reduce((sum, p) => sum + p.value, 0)
  const displayTotal = perSecond
    ? `${(total / (durationMillis / 1000)).toFixed(1)}`
    : `${(total / 1000).toFixed(1)}K`

  return (
    <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      {/* Mirrors the real EventsPanel header chrome (the flip side has none). */}
      {filterStage !== 'editor' && (
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Swords className="h-4 w-4" />
        <span className="text-sm font-medium">Damage Done</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <span className={filtered ? 'text-emerald-500' : 'text-muted-foreground'} data-demo-filter>
          <Filter className="h-3.5 w-3.5" />
        </span>
        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="ml-auto flex items-center gap-2" data-demo-per-second>
          <span className="text-xs text-muted-foreground">Per second</span>
          <div
            className="h-[18px] w-[34px] rounded-full border border-border"
            style={{ background: perSecond ? 'var(--primary)' : 'var(--muted)' }}
          >
            <div
              className="h-[14px] w-[14px] rounded-full bg-foreground"
              style={{ translate: `${perSecond ? 17 : 2}px 1px` }}
            />
          </div>
        </div>
      </header>
      )}
      {filterStage === 'editor' ? (
        <DemoFilterEditor state={filterEditor} />
      ) : (
        <>
          {/* Mirrors DamageDoneContent's Total / Ranks row. */}
          <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
            <div className="text-xs text-muted-foreground">
              Total:{' '}
              <span className="font-medium font-mono text-foreground">
                {displayTotal}
                {perSecond ? '/s' : ''}
              </span>
            </div>
            <div
              className={
                showRanks
                  ? 'flex items-center gap-1 rounded border border-[color:var(--tertiary)]/30 bg-[color:var(--tertiary)]/20 px-2 py-0.5 text-2xs text-[color:var(--tertiary)]'
                  : 'flex items-center gap-1 rounded bg-muted/50 px-2 py-0.5 text-2xs text-muted-foreground'
              }
              data-demo-ranks
            >
              <Layers className="h-3 w-3" />
              Ranks
            </div>
          </div>
          {/* Focus header with back button (mirrors the focused view). */}
          {focusStage === 'focused' && (
            <div className="flex items-center gap-1.5 px-3 pb-1">
              <span
                className="flex items-center gap-1 text-xs text-muted-foreground"
                data-demo-focus-back
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </span>
              <span className="text-xs font-medium">Ragesmash</span>
            </div>
          )}
          {focusStage === 'focused' ? (
            <PlayerMetricChart
              data={FOCUSED_ABILITY_ROWS}
              type="damage"
              duration_millis={durationMillis}
              panelTitle="Ability Breakdown"
              classIconBasePath={classIconBasePath}
              perSecond={perSecond}
              className="min-h-0 flex-1"
            />
          ) : (
          <BreakoutHoverProvider
            hover={
              breakoutHover ? { rowId: breakoutHover.rowId ?? null, columnId: null } : undefined
            }
            selectedAbilities={breakoutHover ? new Set(breakoutHover.selected) : undefined}
          >
            <PlayerMetricChart
              key={`${pinnedKey}${filtered ? '-filtered' : ''}`}
              data={chartData}
              type="damage"
              duration_millis={durationMillis}
              panelTitle="Damage Done"
              breakout={breakout}
              initialPinnedPositions={pinnedPlayers}
              pinnedPositionsOverride={pinnedPlayers}
              classIconBasePath={classIconBasePath}
              perSecond={perSecond}
              parsePills={parsePills}
              className="min-h-0 flex-1"
            />
          </BreakoutHoverProvider>
          )}
        </>
      )}
      {/* Ctrl+click's row context menu (Focus / View Armory). */}
      {focusStage === 'menu' && focusMenuAt && (
        <div
          className="absolute z-20 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: focusMenuAt.x, top: focusMenuAt.y }}
          data-demo-focus-menu
        >
          <div className="flex items-center gap-2 rounded-sm bg-accent px-2 py-1.5 text-xs" data-demo-focus-item>
            <Focus className="h-3.5 w-3.5" />
            Focus Ragesmash
          </div>
          <div className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-xs text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5" />
            View Armory
          </div>
        </div>
      )}

      {/* The filter icon's context menu (Edit filters / Reset to default). */}
      {filterStage === 'menu' && (
        <div
          className="absolute z-20 w-[150px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ left: 190, top: 26 }}
          data-demo-filter-menu
        >
          <div className="rounded bg-muted/60 px-2 py-1.5 text-xs" data-demo-edit-filters>
            Edit filters
          </div>
          <div className="rounded px-2 py-1.5 text-xs text-muted-foreground">Reset to default</div>
        </div>
      )}
      {/* Mirrors the GenericPanel footer diagnostics. */}
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>48.9K events (688.2K/s)</span>
        <span className="ml-auto text-chart-1">71ms</span>
      </footer>
    </section>
  )
}
