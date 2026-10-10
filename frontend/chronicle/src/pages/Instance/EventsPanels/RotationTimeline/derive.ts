/**
 * Pure derivations over rotation timeline processor output.
 * No React; safe to unit test and to reuse from a future panel.
 */

import { DAMAGE_BIN_MS, type PlayerTimelineData, type TimelineCast } from "./rotationTimeline.processor";
import { findOverride, type SpellOverride } from "./spellOverrides";

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

/** Ticks after the planned channel end by more than this belong to something else. */
export const CHANNEL_TICK_SLACK_MS = 250;

/**
 * When the cast or channel actually finished. A channel ends at its last tick
 * (so channels cut short end early, and text logs without a channel time still
 * get one), else at its planned length. A cast ends when the spell went off.
 * Nothing outlasts the player's next GCD or cast-time spell (nextStartMs):
 * starting it cancels a channel still running.
 */
export function castEndMs(cast: TimelineCast, nextStartMs: number | null = null): number {
  let end = Math.max(cast.endMs, cast.startMs);
  if (cast.channel) {
    const planned = cast.channelTimeMs != null ? cast.startMs + cast.channelTimeMs : null;
    const ticks = cast.tickMs.filter((t) => t > cast.startMs && (planned == null || t <= planned + CHANNEL_TICK_SLACK_MS));
    if (ticks.length > 0) end = Math.max(...ticks);
    else if (planned != null) end = planned;
  }
  return nextStartMs != null && nextStartMs > cast.startMs ? Math.min(end, nextStartMs) : end;
}

/** True when starting this spell would cancel a channel: it triggers the GCD or has a cast time. */
function interrupts(cast: TimelineCast, gcd: GcdLookup): boolean {
  return !cast.failed && (gcd(cast.spellId) > 0 || cast.endMs > cast.startMs || cast.channel);
}

/** Finish time of every cast (casts sorted by start), clamped to the next interrupting cast. */
export function castEnds(casts: readonly TimelineCast[], gcd: GcdLookup): Map<TimelineCast, number> {
  const ends = new Map<TimelineCast, number>();
  let nextStart: number | null = null;
  for (let i = casts.length - 1; i >= 0; i--) {
    const cast = casts[i];
    ends.set(cast, castEndMs(cast, nextStart));
    if (interrupts(cast, gcd)) nextStart = cast.startMs;
  }
  return ends;
}

/** How long the cast kept the player busy: cast time, channel, or the GCD. */
export function castSlotEnd(cast: TimelineCast, gcd: GcdLookup, ends?: ReadonlyMap<TimelineCast, number>): number {
  return Math.max(ends?.get(cast) ?? castEndMs(cast), cast.startMs + gcd(cast.spellId));
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
  const ends = castEnds(casts, gcd);
  let busyUntil: number | null = null;
  for (const cast of casts) {
    if (cast.failed) continue;
    if (busyUntil != null && cast.startMs - busyUntil >= thresholdMs) {
      gaps.push({ startMs: busyUntil, endMs: cast.startMs });
    }
    const end = castSlotEnd(cast, gcd, ends);
    busyUntil = busyUntil == null ? end : Math.max(busyUntil, end);
  }
  return gaps;
}

/**
 * Stretches where the player was busy casting: cast slots merged across any
 * gap shorter than the idle threshold. The complement of idleGaps.
 */
export function busySegments(
  casts: readonly TimelineCast[],
  gcd: GcdLookup,
  thresholdMs: number = DEFAULT_IDLE_THRESHOLD_MS,
): IdleGap[] {
  const out: IdleGap[] = [];
  const ends = castEnds(casts, gcd);
  for (const cast of casts) {
    if (cast.failed) continue;
    const end = castSlotEnd(cast, gcd, ends);
    const last = out[out.length - 1];
    if (last && cast.startMs - last.endMs < thresholdMs) last.endMs = Math.max(last.endMs, end);
    else out.push({ startMs: cast.startMs, endMs: end });
  }
  return out;
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

/** What the chart, lead, labels and default picks measure. */
export type TimelineMetric = "damage" | "healing";

export function alignOffsetMs(
  casts: readonly TimelineCast[],
  mode: AlignMode,
  isIgnored: (spellName: string) => boolean = () => false,
): number {
  if (mode === "pull") return 0;
  return casts.find((c) => !c.failed && !isIgnored(c.spellName))?.startMs ?? 0;
}

export interface PlayerStats {
  dps: number;
  hps: number;
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
    hps: durationMs > 0 ? player.totalHealing / (durationMs / 1000) : 0,
    casts: casts.filter((c) => !c.failed).length,
    idleMs,
    idlePct: durationMs > 0 ? (idleMs / durationMs) * 100 : 0,
  };
}

/** The cast whose slot covers timeMs, or null when idle. */
export function castAt(casts: readonly TimelineCast[], timeMs: number, gcd: GcdLookup): TimelineCast | null {
  const ends = castEnds(casts, gcd);
  for (let i = casts.length - 1; i >= 0; i--) {
    const cast = casts[i];
    if (cast.startMs > timeMs) continue;
    if (!cast.failed && timeMs < castSlotEnd(cast, gcd, ends)) return cast;
    if (cast.startMs < timeMs - 60_000) break;
  }
  return null;
}

export interface NearbyActivity {
  /** ms since the last action started, or null before the first. */
  sinceLastMs: number | null;
  /** ms until the next action starts, or null after the last. */
  untilNextMs: number | null;
  /** ms idle at timeMs (0 while casting or on the GCD). */
  idleMs: number;
  /** Start of the last and next actions, and when the player stopped being busy. */
  lastMs: number | null;
  nextMs: number | null;
  busyUntilMs: number | null;
}

/**
 * What a player was doing around timeMs: time since their last action, time
 * to their next, and whether they were idle. casts must be sorted by start
 * and contain only actions the player pressed (no procs).
 *
 * Pass the player's idleGaps so "idle" matches the rail exactly: short pauses
 * under the idle threshold count as busy there, and must here too.
 */
export function nearbyActivity(
  casts: readonly TimelineCast[],
  timeMs: number,
  gcd: GcdLookup,
  gaps?: readonly IdleGap[],
): NearbyActivity {
  const ends = castEnds(casts, gcd);
  let last: TimelineCast | null = null;
  let next: TimelineCast | null = null;
  let busyUntil = -Infinity;
  for (const cast of casts) {
    if (cast.failed) continue;
    if (cast.startMs <= timeMs) {
      last = cast;
      busyUntil = Math.max(busyUntil, castSlotEnd(cast, gcd, ends));
    } else {
      next = cast;
      break;
    }
  }
  let idleMs = last && timeMs > busyUntil ? timeMs - busyUntil : 0;
  let busyUntilMs = last ? busyUntil : null;
  if (gaps) {
    const gap = gaps.find((g) => g.startMs <= timeMs && timeMs < g.endMs);
    idleMs = gap ? timeMs - gap.startMs : 0;
    busyUntilMs = gap ? gap.startMs : busyUntilMs;
  }
  return {
    sinceLastMs: last ? timeMs - last.startMs : null,
    untilNextMs: next ? next.startMs - timeMs : null,
    idleMs,
    lastMs: last?.startMs ?? null,
    nextMs: next?.startMs ?? null,
    busyUntilMs,
  };
}

/**
 * How a cast is drawn: a curated cooldown (ringed square on the rail), a proc
 * (instant and off the GCD, circle on the rail), or a GCD cast (icon in the lane).
 */
export type CastKind = "cooldown" | "proc" | "consume" | "gcd";

export function castKind(
  cast: TimelineCast,
  gcd: GcdLookup,
  cooldownInfo: (spellId: number) => unknown,
): CastKind {
  if (cast.consume) return "consume";
  if (cooldownInfo(cast.spellId) != null) return "cooldown";
  if (gcd(cast.spellId) === 0 && cast.endMs === cast.startMs && !cast.channelTimeMs) return "proc";
  return "gcd";
}

/**
 * Spell overrides that show a proc as a cooldown also need casts to draw. When
 * a player gained the buff but never cast the spell (common for procs), each
 * buff becomes a cast that ends when the buff faded. Returns player data with
 * those casts added; unchanged when nothing applies.
 */
export function withOverrideBuffCasts(
  data: PlayerTimelineData,
  overrides: readonly SpellOverride[],
  durationMs: number,
): PlayerTimelineData {
  // A zero duration means "no tint", so there is nothing to build from buffs.
  const wanted = overrides.filter((o) => o.showAsCooldown && o.showAsCooldown.durationMs !== 0);
  if (wanted.length === 0) return data;
  const casts = data.goCasts.length > 0 ? data.goCasts : data.textCasts;
  const cast = new Set(casts.map((c) => c.spellName.toLowerCase()));
  const added: TimelineCast[] = [];
  for (const seg of data.aurasOn) {
    if (!seg.isBuff || cast.has(seg.spellName.toLowerCase())) continue;
    const override = findOverride(wanted, seg.spellId, seg.spellName);
    if (!override) continue;
    added.push({
      startMs: seg.startMs,
      endMs: seg.startMs,
      spellId: seg.spellId ?? override.spellIds?.[0] ?? -1,
      spellName: seg.spellName,
      target: seg.target,
      castTimeMs: null,
      channelTimeMs: null,
      channel: false,
      tickMs: [],
      failed: false,
      itemId: null,
      damage: 0,
      periodicDamage: 0,
      hits: 0,
      crits: 0,
      healing: 0,
      overheal: 0,
      healCrits: 0,
      buffEndMs: Math.min(seg.endMs ?? durationMs, durationMs),
    });
  }
  if (added.length === 0) return data;
  return data.goCasts.length > 0
    ? { ...data, goCasts: [...data.goCasts, ...added] }
    : { ...data, textCasts: [...data.textCasts, ...added] };
}

/** A logged cast of the same spell this close to a consume is the same use. */
const CONSUME_MATCH_MS = 1000;
/** A buff of the consumable's spell starting this close to the use is the buff it applied. */
const CONSUME_BUFF_MATCH_MS = 1500;

/**
 * Adds the player's consumables as casts drawn on the rail. A logged cast of
 * the same spell within a second (an item-backed spell_go) is replaced, so a
 * use shows once. GCD and busy time still come from the spell's data.
 */
export function withConsumeCasts(data: PlayerTimelineData): PlayerTimelineData {
  if (data.consumes.length === 0) return data;
  // The buff a consumable applied, so its tint shows how long it really lasted.
  const buffFor = (spellId: number, atMs: number) =>
    data.aurasOn.find(
      (a) => a.isBuff && a.spellId === spellId && Math.abs(a.startMs - atMs) <= CONSUME_BUFF_MATCH_MS,
    );
  const matches = (c: TimelineCast) =>
    data.consumes.some((u) => u.spellId === c.spellId && Math.abs(u.offsetMs - c.startMs) <= CONSUME_MATCH_MS);
  const added: TimelineCast[] = data.consumes.map((u) => ({
    startMs: u.offsetMs,
    endMs: u.offsetMs,
    spellId: u.spellId,
    spellName: u.itemName ?? u.spellName,
    target: "",
    castTimeMs: null,
    channelTimeMs: null,
    channel: false,
    tickMs: [],
    failed: false,
    itemId: u.itemId,
    damage: 0,
    periodicDamage: 0,
    hits: 0,
    crits: 0,
    healing: 0,
    overheal: 0,
    healCrits: 0,
    consume: { itemId: u.itemId, itemName: u.itemName },
    ...(() => {
      const buff = buffFor(u.spellId, u.offsetMs);
      return buff?.endMs != null ? { buffEndMs: buff.endMs } : {};
    })(),
  }));
  return data.goCasts.length > 0
    ? { ...data, goCasts: [...data.goCasts.filter((c) => !matches(c)), ...added] }
    : { ...data, textCasts: [...data.textCasts.filter((c) => !matches(c)), ...added] };
}
