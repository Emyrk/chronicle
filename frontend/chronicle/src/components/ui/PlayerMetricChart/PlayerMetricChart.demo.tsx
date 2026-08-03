import { useCallback, useMemo } from 'react'
import {
  AbilityBreakdownTable,
  PlayerMetricChart,
  type AbilityBreakdown,
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
  pinnedPlayerId,
  classIconBasePath,
}: {
  pinnedPlayerId?: string
  classIconBasePath?: string
}) {
  const initialPinnedPositions = useMemo(
    () => pinnedPlayerId ? new Map([[pinnedPlayerId, { x: 720, y: 170 }]]) : undefined,
    [pinnedPlayerId],
  )

  const breakout = useCallback((playerID: string) => {
    const playerAbilities = abilities[playerID] ?? []
    const totalValue = players.find((player) => player.playerID === playerID)?.value ?? 0
    return (
      <AbilityBreakdownTable
        abilities={playerAbilities}
        totalValue={totalValue}
        invertedColors
        durationMillis={durationMillis}
      />
    )
  }, [])

  return (
    <section className="flex h-[430px] w-[620px] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl">
      <header className="flex h-14 shrink-0 items-center border-b border-border bg-background/45 px-4">
        <div>
          <h2 className="font-display text-lg font-bold tracking-wide text-foreground">Damage Done</h2>
          <p className="text-2xs text-muted-foreground">Nefarian · 3:30</p>
        </div>
        <div className="ml-auto rounded-md border border-border bg-muted/35 px-2.5 py-1 text-xs text-muted-foreground">
          Total Damage
        </div>
      </header>
      <PlayerMetricChart
        key={pinnedPlayerId ?? 'unpinned'}
        data={players}
        type="damage"
        duration_millis={durationMillis}
        panelTitle="Damage Done"
        breakout={breakout}
        initialPinnedPositions={initialPinnedPositions}
        classIconBasePath={classIconBasePath}
        className="min-h-0 flex-1"
      />
      <footer className="flex h-10 shrink-0 items-center border-t border-border px-4 text-xs text-muted-foreground">
        <span>Total raid damage</span>
        <span className="ml-auto font-mono font-semibold text-foreground">548,000</span>
      </footer>
    </section>
  )
}
