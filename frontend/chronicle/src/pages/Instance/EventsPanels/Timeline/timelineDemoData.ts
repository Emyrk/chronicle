/**
 * Deterministic data for the Timeline demo harness (kept out of the
 * component file so react-refresh stays happy).
 */

import type { AggregationType } from './timelineTypes'

export const BIN_MS = 1000
export const TOTAL_SEC = 120

/** Deterministic pseudo-noise in [0, 1) — the classic sin-hash, no Math.random. */
function noise(t: number): number {
  const x = Math.sin(t * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Deterministic per-second damage bins: baseline + waves + heavy jitter +
 * crit/ability spike trains + scripted bursts. Deliberately jagged so
 * per-second and rolling-average aggregations contrast sharply.
 */
function damageBins(): number[] {
  const bins: number[] = []
  for (let t = 0; t < TOTAL_SEC; t++) {
    let v = 3200 + 1500 * Math.sin(t / 6) + 800 * Math.sin(t / 2.1)
    v += 3600 * noise(t) // per-second variance (crit luck)
    if (t % 6 === 2) v += 4800 * noise(t + 0.5) // ability cooldown hits
    if (t % 9 === 5) v -= 2200 // movement / downtime dips
    if (t > 28 && t < 36) v += 5200 // trinket + cooldown burst
    if (t > 74 && t < 84) v += 6800 // execute phase burst
    if (t < 4) v *= t / 4 // pull ramp-up
    bins.push(Math.max(0, Math.round(v)))
  }
  return bins
}

/** Deterministic healing bins: jittery triage healing reacting to damage. */
function healingBins(): number[] {
  const bins: number[] = []
  for (let t = 0; t < TOTAL_SEC; t++) {
    let v = 2400 + 1000 * Math.sin(t / 5 + 2)
    v += 2800 * noise(t + 31) // spot-heal variance
    if (t % 7 === 3) v += 3200 * noise(t + 7.5) // big heal lands
    if (t > 31 && t < 41) v += 3600
    if (t > 77 && t < 89) v += 4400
    if (t < 3) v *= t / 3
    bins.push(Math.max(0, Math.round(v)))
  }
  return bins
}

export const RAW_BINS: Record<string, number[]> = {
  damage: damageBins(),
  healing: healingBins(),
}

export interface DemoTimelineSeries {
  id: 'damage' | 'healing'
  name: string
  color: string
  aggregation: AggregationType
}

export const DEMO_DAMAGE_SERIES: DemoTimelineSeries = {
  id: 'damage',
  name: 'Damage',
  color: '#ef4444',
  aggregation: 'sum',
}
export const DEMO_HEALING_SERIES: DemoTimelineSeries = {
  id: 'healing',
  name: 'Healing',
  color: '#22c55e',
  aggregation: 'sum',
}

/** Deterministic raid-durability background bars (percent of raid alive+healthy). */
export const DURABILITY_BARS = Array.from({ length: 12 }, (_, i) => ({
  startSec: i * 10,
  endSec: (i + 1) * 10,
  percent: [100, 100, 92, 84, 88, 78, 66, 58, 70, 62, 54, 48][i],
  color: ['#22c55e', '#22c55e', '#22c55e', '#84cc16', '#84cc16', '#eab308', '#f97316', '#f97316', '#eab308', '#f97316', '#ef4444', '#ef4444'][i],
}))

