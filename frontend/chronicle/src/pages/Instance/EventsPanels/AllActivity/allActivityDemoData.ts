/**
 * Deterministic All Activity demo fixtures, shared by the demo harness and
 * the lesson videos. Kept out of AllActivity.demo.tsx for react-refresh.
 */

import {
  Heart,
  HeartPulse,
  Shield,
  Skull,
  Sparkles,
  Swords,
  Wand2,
  Zap,
  type LucideIcon,
} from 'lucide-react'

export type DemoStream =
  | 'damage'
  | 'heal'
  | 'resource_change'
  | 'slain'
  | 'ressurection'
  | 'aura'
  | 'cast'
  | 'absorbed'

export const DEFAULT_DEMO_STREAMS: DemoStream[] = ['damage', 'heal', 'slain', 'ressurection']

export interface DemoStreamChip {
  stream: DemoStream
  icon: LucideIcon
  color: string
  label: string
  description: string
  count: string
  code: string
}

/** A readable subset of the real panel's 17 stream toggles. */
export const DEMO_STREAM_CHIPS: DemoStreamChip[] = [
  { stream: 'damage', icon: Swords, color: 'text-red-500', label: 'Damage', description: 'Damage dealt, including hit outcomes, schools, and mitigation.', count: '4.2K', code: 'DMG' },
  { stream: 'heal', icon: Heart, color: 'text-green-500', label: 'Healing', description: 'Healing received, including critical heals and overhealing.', count: '1.8K', code: 'HEAL' },
  { stream: 'resource_change', icon: Zap, color: 'text-yellow-500', label: 'Resource', description: 'Health, mana, rage, energy, and other resource gains or losses.', count: '6.5K', code: 'RES' },
  { stream: 'slain', icon: Skull, color: 'text-pink-400', label: 'Slain', description: 'Unit deaths and the final-damage attribution when available.', count: '14', code: 'DEAD' },
  { stream: 'ressurection', icon: HeartPulse, color: 'text-emerald-400', label: 'Resurrection', description: 'Players or units restored to life by a resurrection spell.', count: '3', code: 'REZ' },
  { stream: 'aura', icon: Sparkles, color: 'text-cyan-500', label: 'Aura', description: 'Buff and debuff applications, removals, and stack changes.', count: '3.1K', code: 'AURA' },
  { stream: 'cast', icon: Wand2, color: 'text-purple-500', label: 'Cast', description: 'General spell cast actions and their selected targets.', count: '2.4K', code: 'CAST' },
  { stream: 'absorbed', icon: Shield, color: 'text-sky-400', label: 'Absorbed', description: 'Damage prevented by shields and other absorb effects.', count: '620', code: 'ABS' },
]

export interface DemoActivityEvent {
  idx: number
  stream: DemoStream
  encounter: 'Ragnaros' | 'Golemagg'
  /** Server time (logs are UTC), viewer local time (+2h here), fight offset. */
  utc: string
  local: string
  rel: string
  source: string
  sourceClass?: string
  sourceEnemy?: boolean
  ability: string
  target: string
  targetClass?: string
  targetEnemy?: boolean
  value: string
  detail: string
  flags: string[]
  activity?: 'start' | 'bump' | 'end' | 'slain'
}

function ev(
  idx: number,
  stream: DemoStream,
  encounter: 'Ragnaros' | 'Golemagg',
  utc: string,
  rel: string,
  source: string,
  sourceClass: string | undefined,
  ability: string,
  target: string,
  targetClass: string | undefined,
  value: string,
  detail: string,
  flags: string[] = [],
  activity?: DemoActivityEvent['activity'],
): DemoActivityEvent {
  // Viewer sits at UTC+2 — the local clock is exactly two hours later.
  const local = `${String((Number(utc.slice(0, 2)) + 2) % 24).padStart(2, '0')}${utc.slice(2)}`
  return {
    idx,
    stream,
    encounter,
    utc,
    local,
    rel,
    source,
    sourceClass,
    sourceEnemy: sourceClass === undefined && source !== '—',
    ability,
    target,
    targetClass,
    targetEnemy: targetClass === undefined && target !== '—',
    value,
    detail,
    flags,
    activity,
  }
}

export const DEMO_ACTIVITY_EVENTS: DemoActivityEvent[] = [
  ev(184, 'damage', 'Ragnaros', '19:04:12.480', '+0:07.4', 'Ragnaros', undefined, 'Melee', 'Brickwall', 'Warrior', '-1,842', 'Physical · hit'),
  ev(185, 'heal', 'Ragnaros', '19:04:13.115', '+0:08.1', 'Chainheal', 'Shaman', 'Chain Heal', 'Brickwall', 'Warrior', '+2,410', 'Nature', ['OVERHEAL']),
  ev(187, 'damage', 'Ragnaros', '19:04:13.940', '+0:08.9', 'Blazewing', 'Mage', 'Fireball', 'Ragnaros', undefined, '-1,203', 'Fire · crit', ['CRIT']),
  ev(188, 'aura', 'Ragnaros', '19:04:14.210', '+0:09.2', 'Lightmender', 'Priest', 'Renew', 'Brickwall', 'Warrior', '—', 'applied · 15s', [], 'start'),
  ev(190, 'resource_change', 'Ragnaros', '19:04:14.655', '+0:09.6', 'Whisperfaith', 'Priest', 'Spirit Tap', 'Whisperfaith', 'Priest', '+420', 'Mana'),
  ev(192, 'cast', 'Ragnaros', '19:04:15.020', '+0:10.0', 'Chainheal', 'Shaman', 'Chain Heal', '—', undefined, '—', 'begin cast · 2.5s'),
  ev(195, 'damage', 'Ragnaros', '19:04:16.330', '+0:11.3', 'Ragnaros', undefined, 'Lava Burst', 'Blazewing', 'Mage', '-5,200', 'Fire · crit', ['CRIT', 'OVERKILL']),
  ev(196, 'slain', 'Ragnaros', '19:04:16.335', '+0:11.3', 'Ragnaros', undefined, 'Lava Burst', 'Blazewing', 'Mage', '—', 'killing blow', [], 'slain'),
  ev(199, 'heal', 'Ragnaros', '19:04:17.480', '+0:12.4', 'Lightmender', 'Priest', 'Flash Heal', 'Shadowmeld', 'Rogue', '+1,900', 'Holy'),
  ev(201, 'absorbed', 'Ragnaros', '19:04:18.020', '+0:13.0', 'Firesworn', undefined, 'Fire Nova', 'Whisperfaith', 'Priest', '900', 'Power Word: Shield', ['ABSORB']),
  ev(204, 'ressurection', 'Ragnaros', '19:04:21.700', '+0:16.7', 'Lightmender', 'Priest', 'Resurrection', 'Blazewing', 'Mage', '—', 'returned to life', [], 'start'),
  ev(206, 'damage', 'Ragnaros', '19:04:22.410', '+0:17.4', 'Shadowmeld', 'Rogue', 'Sinister Strike', 'Ragnaros', undefined, '-843', 'Physical'),
  ev(209, 'aura', 'Ragnaros', '19:04:23.150', '+0:18.1', 'Ragnaros', undefined, 'Fire Nova', 'Whisperfaith', 'Priest', '—', 'applied · debuff', [], 'start'),
  ev(212, 'damage', 'Golemagg', '19:12:09.240', '+0:02.1', 'Golemagg', undefined, 'Magma Splash', 'Brickwall', 'Warrior', '-980', 'Fire'),
  ev(214, 'heal', 'Golemagg', '19:12:10.005', '+0:02.9', 'Chainheal', 'Shaman', 'Chain Heal', 'Brickwall', 'Warrior', '+1,750', 'Nature'),
  ev(215, 'damage', 'Golemagg', '19:12:10.860', '+0:03.7', 'Brickwall', 'Warrior', 'Heroic Strike', 'Golemagg', undefined, '-612', 'Physical'),
]

/** The filtered view the demo shows for a given state. */
export function filterDemoEvents(
  enabledStreams: DemoStream[],
  sourceFilter: string,
  abilityFilter: string,
  targetFilter: string,
): DemoActivityEvent[] {
  const src = sourceFilter.trim().toLowerCase()
  const abl = abilityFilter.trim().toLowerCase()
  const tgt = targetFilter.trim().toLowerCase()
  return DEMO_ACTIVITY_EVENTS.filter(
    (e) =>
      enabledStreams.includes(e.stream) &&
      (!src || e.source.toLowerCase().includes(src)) &&
      (!abl || e.ability.toLowerCase().includes(abl)) &&
      (!tgt || e.target.toLowerCase().includes(tgt)),
  )
}
