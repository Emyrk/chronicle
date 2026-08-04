import { useCallback } from 'react'
import { ChevronDown, Filter, Heart, HelpCircle, Layers, MoreVertical } from 'lucide-react'
import {
  AbilityBreakout,
  BreakoutHoverProvider,
  type AbilityData,
  type BreakoutTab,
  type TargetData,
} from '@/components/ui/AbilityBreakout'
import { PlayerMetricChart, type PlayerMetricChartData } from './PlayerMetricChart'

const durationMillis = 210_000

/** Mirrors HealingDoneContent's view modes. */
export type DemoHealingViewMode = 'effective' | 'overheal' | 'total'

interface HealAbility {
  name: string
  effective: number
  overheal: number
  casts: number
  crits: number
}

interface HealTarget {
  targetName: string
  effective: number
  overheal: number
  count: number
}

interface Healer {
  playerID: string
  playerName: string
  className: string
  specialization: string
  effective: number
  overheal: number
  abilities: HealAbility[]
  targets: HealTarget[]
}

const HEALERS: Healer[] = [
  {
    playerID: 'healer-1',
    playerName: 'Lightmender',
    className: 'Priest',
    specialization: 'Holy',
    effective: 128_000,
    overheal: 22_000,
    abilities: [
      { name: 'Greater Heal', effective: 62_000, overheal: 9_000, casts: 40, crits: 9 },
      { name: 'Flash Heal', effective: 38_000, overheal: 6_000, casts: 46, crits: 10 },
      { name: 'Renew', effective: 20_000, overheal: 5_000, casts: 90, crits: 0 },
      { name: 'Prayer of Healing', effective: 8_000, overheal: 2_000, casts: 12, crits: 2 },
    ],
    targets: [
      { targetName: 'Brickwall', effective: 58_000, overheal: 9_000, count: 64 },
      { targetName: 'Shadowmeld', effective: 24_000, overheal: 5_000, count: 38 },
      { targetName: 'Blazewing', effective: 18_000, overheal: 3_000, count: 30 },
      { targetName: 'Treesong', effective: 16_000, overheal: 3_000, count: 28 },
      { targetName: 'Markshot', effective: 12_000, overheal: 2_000, count: 28 },
    ],
  },
  {
    playerID: 'healer-2',
    playerName: 'Treesong',
    className: 'Druid',
    specialization: 'Restoration',
    effective: 112_000,
    overheal: 41_000,
    abilities: [
      { name: 'Rejuvenation', effective: 48_000, overheal: 21_000, casts: 110, crits: 0 },
      { name: 'Healing Touch', effective: 40_000, overheal: 12_000, casts: 28, crits: 6 },
      { name: 'Regrowth', effective: 24_000, overheal: 8_000, casts: 26, crits: 5 },
    ],
    targets: [
      { targetName: 'Brickwall', effective: 44_000, overheal: 17_000, count: 70 },
      { targetName: 'Markshot', effective: 26_000, overheal: 9_000, count: 40 },
      { targetName: 'Shadowmeld', effective: 22_000, overheal: 8_000, count: 34 },
      { targetName: 'Lightmender', effective: 20_000, overheal: 7_000, count: 30 },
    ],
  },
  {
    playerID: 'healer-3',
    playerName: 'Chainheal',
    className: 'Shaman',
    specialization: 'Restoration',
    effective: 104_000,
    overheal: 18_000,
    abilities: [
      { name: 'Chain Heal', effective: 66_000, overheal: 12_000, casts: 44, crits: 8 },
      { name: 'Healing Wave', effective: 30_000, overheal: 5_000, casts: 22, crits: 4 },
      { name: 'Lesser Healing Wave', effective: 8_000, overheal: 1_000, casts: 10, crits: 1 },
    ],
    targets: [
      { targetName: 'Ragesmash', effective: 40_000, overheal: 7_000, count: 42 },
      { targetName: 'Blazewing', effective: 34_000, overheal: 6_000, count: 36 },
      { targetName: 'Afflicted', effective: 30_000, overheal: 5_000, count: 32 },
    ],
  },
  {
    playerID: 'healer-4',
    playerName: 'Dawnprayer',
    className: 'Paladin',
    specialization: 'Holy',
    effective: 96_000,
    overheal: 9_000,
    abilities: [
      { name: 'Flash of Light', effective: 58_000, overheal: 5_000, casts: 74, crits: 15 },
      { name: 'Holy Light', effective: 34_000, overheal: 4_000, casts: 18, crits: 4 },
      { name: 'Holy Shock', effective: 4_000, overheal: 0, casts: 5, crits: 1 },
    ],
    targets: [
      { targetName: 'Brickwall', effective: 70_000, overheal: 7_000, count: 72 },
      { targetName: 'Ragesmash', effective: 26_000, overheal: 2_000, count: 25 },
    ],
  },
  {
    playerID: 'healer-5',
    playerName: 'Glowmoss',
    className: 'Druid',
    specialization: 'Restoration',
    effective: 74_000,
    overheal: 30_000,
    abilities: [
      { name: 'Rejuvenation', effective: 38_000, overheal: 18_000, casts: 96, crits: 0 },
      { name: 'Regrowth', effective: 22_000, overheal: 7_000, casts: 22, crits: 4 },
      { name: 'Healing Touch', effective: 14_000, overheal: 5_000, casts: 12, crits: 2 },
    ],
    targets: [
      { targetName: 'Markshot', effective: 30_000, overheal: 13_000, count: 52 },
      { targetName: 'Shadowmeld', effective: 24_000, overheal: 9_000, count: 40 },
      { targetName: 'Afflicted', effective: 20_000, overheal: 8_000, count: 34 },
    ],
  },
]

function healerValue(h: Healer, mode: DemoHealingViewMode): number {
  return mode === 'overheal' ? h.overheal : mode === 'total' ? h.effective + h.overheal : h.effective
}

function toChartData(mode: DemoHealingViewMode): PlayerMetricChartData[] {
  return HEALERS.map((h) => ({
    playerID: h.playerID,
    playerName: h.playerName,
    className: h.className,
    specialization: h.specialization,
    value: healerValue(h, mode),
    stackedValue: mode === 'effective' && h.overheal > 0 ? h.overheal : undefined,
  }))
}

function toAbilityData(a: HealAbility, mode: DemoHealingViewMode): AbilityData {
  const value = mode === 'overheal' ? a.overheal : mode === 'total' ? a.effective + a.overheal : a.effective
  return {
    name: a.name,
    value,
    overheal: mode === 'effective' ? a.overheal : undefined,
    Total: value,
    Count: a.casts,
    Hits: a.casts,
    Crits: a.crits,
    Misses: 0,
  }
}

function toTargetData(healerID: string, t: HealTarget, i: number, mode: DemoHealingViewMode): TargetData {
  const value = mode === 'overheal' ? t.overheal : mode === 'total' ? t.effective + t.overheal : t.effective
  return {
    targetId: `${healerID}-target-${i}`,
    targetName: t.targetName,
    value,
    hitCount: t.count,
    critCount: 0,
    overheal: mode === 'effective' ? t.overheal : undefined,
  }
}

export function PlayerMetricChartHealingDemo({
  pinnedPlayers,
  classIconBasePath,
  perSecond,
  viewMode = 'effective',
  breakoutTab = 'ability',
}: {
  /** Controlled pinned breakouts: playerID → portal-container position. */
  pinnedPlayers?: ReadonlyMap<string, { x: number; y: number }>
  classIconBasePath?: string
  /** Show HPS values instead of totals (drives the explainer videos). */
  perSecond?: boolean
  /** Mirrors the panel's Effective | Overheal | Total toggle. */
  viewMode?: DemoHealingViewMode
  /** Controlled breakout tab (By Ability / Healed) for scripted videos. */
  breakoutTab?: BreakoutTab
}) {
  const pinnedKey = pinnedPlayers ? [...pinnedPlayers.keys()].sort().join(',') : 'unpinned'

  const breakout = useCallback(
    (playerID: string) => {
      const healer = HEALERS.find((h) => h.playerID === playerID)
      if (!healer) return null
      return (
        <AbilityBreakout
          abilities={healer.abilities.map((a) => toAbilityData(a, viewMode))}
          targets={healer.targets.map((t, i) => toTargetData(playerID, t, i, viewMode))}
          totalValue={healerValue(healer, viewMode)}
          valueLabel={viewMode === 'overheal' ? 'Overheal' : viewMode === 'total' ? 'Total' : 'Effective'}
          targetTabLabel={viewMode === 'overheal' ? 'Overhealed' : 'Healed'}
          showHits={false}
          showOverheal={viewMode === 'effective'}
          activeTab={breakoutTab}
          onTabChange={() => {}}
        />
      )
    },
    [viewMode, breakoutTab],
  )

  const chartData = toChartData(viewMode)
  const total = chartData.reduce((sum, p) => sum + p.value, 0)
  const overhealTotal = HEALERS.reduce((sum, h) => sum + h.overheal, 0)
  const overhealPercent =
    viewMode === 'effective' ? ((overhealTotal / (total + overhealTotal)) * 100).toFixed(1) : null
  const displayTotal = perSecond
    ? `${(total / (durationMillis / 1000)).toFixed(1)}`
    : `${(total / 1000).toFixed(1)}K`

  return (
    <section className="relative flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      {/* Mirrors the real EventsPanel header chrome. */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Heart className="h-4 w-4" />
        <span className="text-sm font-medium">Healing Done</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">
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
      {/* Mirrors HealingDoneContent's Total / Ranks / view-mode row. */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
        <div className="text-xs text-muted-foreground">
          Total:{' '}
          <span className="font-medium font-mono text-foreground">
            {displayTotal}
            {perSecond ? '/s' : ''}
          </span>
          {overhealPercent && (
            <span className="ml-2 text-muted-foreground">
              (<span className="font-mono text-yellow-500">+{overhealPercent}%</span> overheal)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded border border-[color:var(--tertiary)]/30 bg-[color:var(--tertiary)]/20 px-2 py-0.5 text-2xs text-[color:var(--tertiary)]">
            <Layers className="h-3 w-3" />
            Ranks
          </div>
          <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5" data-demo-heal-modes>
            {(['effective', 'overheal', 'total'] as DemoHealingViewMode[]).map((mode) => (
              <span
                key={mode}
                className={
                  viewMode === mode
                    ? 'rounded bg-background px-2 py-0.5 text-2xs text-foreground shadow-sm'
                    : 'rounded px-2 py-0.5 text-2xs text-muted-foreground'
                }
                data-demo-heal-mode={mode}
              >
                {mode === 'effective' ? 'Effective' : mode === 'overheal' ? 'Overheal' : 'Total'}
              </span>
            ))}
          </div>
        </div>
      </div>
      {/* Shared across every pinned breakout, like the real EventsPanel. */}
      <BreakoutHoverProvider>
        <PlayerMetricChart
          key={`${pinnedKey}-${viewMode}`}
          data={chartData}
          type="healing"
          duration_millis={durationMillis}
          panelTitle={viewMode === 'overheal' ? 'Overhealing' : 'Healing Done'}
          breakout={breakout}
          initialPinnedPositions={pinnedPlayers}
          pinnedPositionsOverride={pinnedPlayers}
          classIconBasePath={classIconBasePath}
          perSecond={perSecond}
          className="min-h-0 flex-1"
        />
      </BreakoutHoverProvider>
      {/* Mirrors the GenericPanel footer diagnostics. */}
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>31.2K events (445.7K/s)</span>
        <span className="ml-auto text-chart-1">54ms</span>
      </footer>
    </section>
  )
}
