/**
 * Deterministic Death Log demo fixtures, shared by the demo harness and the
 * lesson videos. Kept out of DeathLog.demo.tsx for react-refresh.
 */

import { HitTypeCrit } from '@/lib/hittype/hittype'
import type { DeathRecapEntry } from './deaths.processor'

export interface DemoDeath {
  offsetMilli: number
  clock: string
  encounter: string
  killerName: string
  playerName: string
  className: string
  attribution?: { sourceName: string; amount: number; school: string; crit: boolean }
}

export const DEMO_DEATHS: DemoDeath[] = [
  { offsetMilli: 61_200, clock: '21:04:18', encounter: 'Ragnaros', killerName: 'Ragnaros', playerName: 'Whisperfaith', className: 'Priest', attribution: { sourceName: 'Elemental Fire', amount: 3_850, school: 'Fire', crit: false } },
  { offsetMilli: 83_400, clock: '21:04:40', encounter: 'Ragnaros', killerName: 'Ragnaros', playerName: 'Blazewing', className: 'Mage', attribution: { sourceName: 'Lava Burst', amount: 5_200, school: 'Fire', crit: true } },
  { offsetMilli: 96_100, clock: '21:04:53', encounter: 'Ragnaros', killerName: 'Son of Flame', playerName: 'Shadowmeld', className: 'Rogue', attribution: { sourceName: 'Melee', amount: 2_640, school: 'Physical', crit: false } },
  { offsetMilli: 45_800, clock: '21:12:07', encounter: 'Golemagg', killerName: 'Golemagg', playerName: 'Brickwall', className: 'Warrior', attribution: { sourceName: 'Magma Splash', amount: 2_980, school: 'Fire', crit: false } },
  { offsetMilli: 101_300, clock: '21:13:03', encounter: 'Golemagg', killerName: 'Core Rager', playerName: 'Markshot', className: 'Hunter', attribution: { sourceName: 'Mangle', amount: 3_420, school: 'Physical', crit: false } },
]

/** Blazewing's final ten seconds (anchor = death at 83,400ms). */
export const BLAZEWING_DEATH_OFFSET = 83_400
export const BLAZEWING_DEATH_ABSOLUTE = 1_700_000_000_000 + BLAZEWING_DEATH_OFFSET

function entry(
  offsetMilli: number,
  eventIndex: number,
  type: DeathRecapEntry['type'],
  sourceName: string,
  casterName: string,
  casterClass: string | null,
  amount: number,
  extra: Partial<DeathRecapEntry> = {},
): DeathRecapEntry {
  return {
    offsetMilli,
    eventIndex,
    sourceName,
    casterName,
    casterID: `guid-${casterName}`,
    targetName: 'Blazewing',
    targetID: 'guid-Blazewing',
    targetClass: 'Mage',
    amount,
    school: type === 'damage' && sourceName !== 'Melee' ? 4 : 2,
    hitType: 0,
    spellId: null,
    type,
    casterClass,
    ...extra,
  }
}

export const BLAZEWING_RECAP: DeathRecapEntry[] = [
  entry(74_200, 1, 'damage', 'Melee', 'Ragnaros', null, 2_100, { blocked: 180 }),
  entry(75_100, 2, 'heal', 'Chain Heal', 'Chainheal', 'Shaman', 2_400, { overheal: 350 }),
  entry(76_300, 3, 'damage', 'Lava Burst', 'Ragnaros', null, 3_900, { resisted: 600 }),
  entry(77_800, 4, 'heal', 'Flash Heal', 'Lightmender', 'Priest', 1_900),
  entry(78_900, 5, 'damage', 'Melee', 'Ragnaros', null, 2_250),
  entry(79_650, 6, 'damage', 'Fire Nova', 'Firesworn', null, 1_450, { absorbed: 700 }),
  entry(80_400, 7, 'heal', 'Renew', 'Lightmender', 'Priest', 480),
  entry(81_000, 8, 'absorbed', 'Fire Nova', 'Firesworn', null, 900, { absorbSpellName: 'Power Word: Shield' }),
  entry(81_900, 9, 'damage', 'Melee', 'Ragnaros', null, 2_300),
  entry(82_700, 10, 'heal', 'Chain Heal', 'Chainheal', 'Shaman', 2_350, { overheal: 900 }),
  entry(83_100, 11, 'damage', 'Lava Burst', 'Ragnaros', null, 4_100),
  entry(83_400, 12, 'damage', 'Lava Burst', 'Ragnaros', null, 5_200, { hitType: HitTypeCrit, overkill: 800 }),
]
