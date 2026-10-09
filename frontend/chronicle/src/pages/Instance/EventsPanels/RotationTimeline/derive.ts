/**
 * Pure derivations over rotation timeline processor output.
 * No React; safe to unit test and to reuse from a future panel.
 */

import { DAMAGE_BIN_MS, type PlayerTimelineData, type TimelineCast } from "./rotationTimeline.processor";

export const DEFAULT_GCD_MS = 1500;
export const DEFAULT_IDLE_THRESHOLD_MS = 400;
export const DPS_SMOOTHING_BINS = 5;

/** Returns the GCD a spell triggers, in ms. 0 means off the GCD. */
export type GcdLookup = (spellId: number) => number;

export const defaultGcd: GcdLookup = () => DEFAULT_GCD_MS;

/**
 * Prefer spell_go casts (they carry cast times and item IDs). Older text logs
 * only have the "cast" stream.
 */
export function playerCasts(player: PlayerTimelineData): TimelineCast[] {
  const casts = player.goCasts.length > 0 ? player.goCasts : player.textCasts;
  return casts.slice().sort((a, b) => a.startMs - b.startMs);
}

/** How long the cast kept the player busy: cast time, channel, or the GCD. */
export function castSlotEnd(cast: TimelineCast, gcd: GcdLookup): number {
  const castEnd = Math.max(cast.endMs, cast.startMs + (cast.channelTimeMs ?? 0));
  return Math.max(castEnd, cast.startMs + gcd(cast.spellId));
}

export interface IdleGap {
  startMs: number;
  endMs: number;
}

/**
 * Gaps between one cast's slot ending and the next cast starting. Spells off
 * the GCD (gcd 0, e.g. Heroic Strike) neither start nor end a gap on their own
 * slot, but they still mark the player as active at that moment.
 */
export function idleGaps(
  casts: readonly TimelineCast[],
  gcd: GcdLookup,
  thresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS,
): IdleGap[] {
  const gaps: IdleGap[] = [];
  let busyUntil: number | null = null;
  for (const cast of casts) {
    if (cast.failed) continue;
    if (busyUntil != null && cast.startMs - busyUntil >= thresholdMs) {
      gaps.push({ startMs: busyUntil, endMs: cast.startMs });
    }
    const end = castSlotEnd(cast, gcd);
    busyUntil = busyUntil == null ? end : Math.max(busyUntil, end);
  }
  return gaps;
}

export function totalIdleMs(gaps: readonly IdleGap[]): number {
  return gaps.reduce((sum, g) => sum + (g.endMs - g.startMs), 0);
}

/** Trailing moving average of damage per second, one value per bin. */
export function dpsSeries(bins: readonly number[], lengthBins: number, smoothing = DPS_SMOOTHING_BINS): number[] {
  const out: number[] = [];
  let windowSum = 0;
  for (let i = 0; i < lengthBins; i++) {
    windowSum += bins[i] ?? 0;
    if (i >= smoothing) windowSum -= bins[i - smoothing] ?? 0;
    const span = Math.min(i + 1, smoothing);
    out.push((windowSum / span) * (1000 / DAMAGE_BIN_MS));
  }
  return out;
}

/** Cumulative damage of A minus cumulative damage of B, per bin. */
export function damageLead(binsA: readonly number[], binsB: readonly number[], lengthBins: number): number[] {
  const out: number[] = [];
  let lead = 0;
  for (let i = 0; i < lengthBins; i++) {
    lead += (binsA[i] ?? 0) - (binsB[i] ?? 0);
    out.push(lead);
  }
  return out;
}

export type AlignMode = "pull" | "first_cast";

export function alignOffsetMs(casts: readonly TimelineCast[], mode: AlignMode, ignored: ReadonlySet<number>): number {
  if (mode === "pull") return 0;
  return casts.find((c) => !c.failed && !ignored.has(c.spellId))?.startMs ?? 0;
}

export interface PlayerStats {
  dps: number;
  casts: number;
  idleMs: number;
  idlePct: number;
}

export function playerStats(
  player: PlayerTimelineData,
  casts: readonly TimelineCast[],
  gaps: readonly IdleGap[],
  durationMs: number,
): PlayerStats {
  const idleMs = totalIdleMs(gaps);
  return {
    dps: durationMs > 0 ? player.totalDamage / (durationMs / 1000) : 0,
    casts: casts.filter((c) => !c.failed).length,
    idleMs,
    idlePct: durationMs > 0 ? (idleMs / durationMs) * 100 : 0,
  };
}

/** The cast whose slot covers timeMs, or null when idle. */
export function castAt(casts: readonly TimelineCast[], timeMs: number, gcd: GcdLookup): TimelineCast | null {
  for (let i = casts.length - 1; i >= 0; i--) {
    const cast = casts[i];
    if (cast.startMs > timeMs) continue;
    if (!cast.failed && timeMs < castSlotEnd(cast, gcd)) return cast;
    if (cast.startMs < timeMs - 60_000) break;
  }
  return null;
}
