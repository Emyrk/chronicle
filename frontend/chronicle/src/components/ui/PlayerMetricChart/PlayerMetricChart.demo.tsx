import { useCallback } from 'react'
import { ChevronDown, Filter, HelpCircle, Layers, MoreVertical, Swords } from 'lucide-react'
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
    { name: 'Ignite', totalDamage: 27_000, hitCount: 26, critCount: 0, missCount: 0, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
    { name: 'Fire Blast', totalDamage: 20_000, hitCount: 12, critCount: 5, missCount: 1, dodgeCount: 0, immuneCount: 0, parryCount: 0, otherCount: 0 },
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

export function PlayerMetricChartAbilityBreakdownDemo({
  pinnedPlayers,
  classIconBasePath,
  perSecond,
  parsePills,
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
}) {
  const pinnedKey = pinnedPlayers ? [...pinnedPlayers.keys()].sort().join(',') : 'unpinned'

  const breakout = useCallback((playerID: string) => {
    const playerAbilities = abilities[playerID] ?? []
    const totalValue = players.find((player) => player.playerID === playerID)?.value ?? 0
    return (
      <AbilityBreakdownTable
        abilities={playerAbilities}
        totalValue={totalValue}
        durationMillis={durationMillis}
      />
    )
  }, [])

  const total = players.reduce((sum, p) => sum + p.value, 0)
  const displayTotal = perSecond
    ? `${(total / (durationMillis / 1000)).toFixed(1)}`
    : `${(total / 1000).toFixed(1)}K`

  return (
    <section className="flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      {/* Mirrors the real EventsPanel header chrome. */}
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Swords className="h-4 w-4" />
        <span className="text-sm font-medium">Damage Done</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        <MoreVertical className="h-3.5 w-3.5 text-muted-foreground" />
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
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
      {/* Mirrors DamageDoneContent's Total / Ranks row. */}
      <div className="flex shrink-0 items-center justify-between px-3 pb-1 pt-2">
        <div className="text-xs text-muted-foreground">
          Total:{' '}
          <span className="font-medium font-mono text-foreground">
            {displayTotal}
            {perSecond ? '/s' : ''}
          </span>
        </div>
        <div className="flex items-center gap-1 rounded border border-[color:var(--tertiary)]/30 bg-[color:var(--tertiary)]/20 px-2 py-0.5 text-2xs text-[color:var(--tertiary)]">
          <Layers className="h-3 w-3" />
          Ranks
        </div>
      </div>
      <PlayerMetricChart
        key={pinnedKey}
        data={players}
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
      {/* Mirrors the GenericPanel footer diagnostics. */}
      <footer className="flex h-8 shrink-0 items-center border-t border-border px-3 font-mono text-2xs text-muted-foreground">
        <span>48.9K events (688.2K/s)</span>
        <span className="ml-auto text-chart-1">71ms</span>
      </footer>
    </section>
  )
}
