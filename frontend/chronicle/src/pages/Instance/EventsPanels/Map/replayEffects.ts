/**
 * Replay Map effects (hit wobble, beams, cast/AoE rings, deaths) derived
 * purely from the replay cursor. Worker-safe: no three.js, no React. Every
 * effect is a function of (events, cursor), so scrubbing in either direction
 * re-derives the same frame and never leaves stale effects behind.
 */

export type ReplayEffectKind = "damage" | "heal" | "cast_start" | "cast_go" | "interrupt" | "slain" | "resurrect";

export interface ReplayEffectEvent {
  timestampMs: number;
  kind: ReplayEffectKind;
  source: string;
  target: string;
  /** chronicleproto School enum value (0 = unknown). */
  school: number;
  amount: number;
  crit: boolean;
  periodic: boolean;
  melee: boolean;
  aoe: boolean;
  castTimeMs: number;
  spellId: number | null;
}

export interface EncounterEffects {
  /** Time-sorted. */
  events: ReplayEffectEvent[];
  /** Time-sorted death and resurrection timestamps per unit. */
  deathsByUnit: Map<string, number[]>;
  resurrectsByUnit: Map<string, number[]>;
}

export type ActiveEffectType = "beam" | "hit" | "ring" | "cast";

export interface ActiveEffect {
  type: ActiveEffectType;
  /** Beam origin; absent for effects anchored on one unit. */
  source?: string;
  /** The unit the effect is drawn at (the caster for rings and casts). */
  target: string;
  /** 0 at the event, approaching 1 as the effect expires. */
  progress: number;
  /** CSS colour, possibly a `var(--token)`. */
  color: string;
  /** 1 for a normal hit; higher for crits and merged hits (capped). */
  intensity: number;
  /** Timestamp of the (newest merged) event that produced the effect. */
  eventMs: number;
}

export interface DeriveEffectsOptions {
  lookbackMs: number;
  /** When set, only events whose source or target is in the set are shown. */
  filterGuids: ReadonlySet<string> | null;
  /** Kept first when the cap is reached (selected players, bosses). */
  priorityGuids: ReadonlySet<string> | null;
  /** Units that can be drawn; effects on other units are skipped before capping. */
  visibleGuids: { has(guid: string): boolean } | null;
  maxEffects: number;
  showPeriodic: boolean;
  showHeals: boolean;
}

export const DEFAULT_EFFECT_OPTIONS: DeriveEffectsOptions = {
  lookbackMs: 800,
  filterGuids: null,
  priorityGuids: null,
  visibleGuids: null,
  maxEffects: 64,
  showPeriodic: false,
  showHeals: true,
};

export const BEAM_MS = 350;
export const MELEE_FLASH_MS = 150;
export const HIT_WOBBLE_MS = 300;
export const AOE_RING_MS = 600;
export const CAST_RING_MAX_MS = 3000;
export const INTERRUPT_MS = 400;
export const MERGE_MS = 100;
const MAX_INTENSITY = 3;

export const INTERRUPT_COLOR = "#ffffff";
const SCHOOL_TOKENS: Record<number, string> = {
  2: "physical",
  3: "holy",
  4: "fire",
  5: "nature",
  6: "frost",
  7: "shadow",
  8: "arcane",
};

export function schoolColor(school: number): string {
  return `var(--color-school-${SCHOOL_TOKENS[school] ?? "physical"})`;
}

export function createEncounterEffects(): EncounterEffects {
  return { events: [], deathsByUnit: new Map(), resurrectsByUnit: new Map() };
}

/**
 * Appends an event, keeping `events` time-sorted. Events arrive in index
 * order, which is almost always time order, so this is an O(1) push.
 */
export function addEffectEvent(fx: EncounterEffects, event: ReplayEffectEvent) {
  insertSorted(fx.events, event, (entry) => entry.timestampMs);
  if (event.kind === "slain") pushTime(fx.deathsByUnit, event.target, event.timestampMs);
  if (event.kind === "resurrect") pushTime(fx.resurrectsByUnit, event.target, event.timestampMs);
}

function pushTime(byUnit: Map<string, number[]>, guid: string, timestampMs: number) {
  let times = byUnit.get(guid);
  if (!times) {
    times = [];
    byUnit.set(guid, times);
  }
  insertSorted(times, timestampMs, (time) => time);
}

function insertSorted<T>(list: T[], item: T, time: (item: T) => number) {
  let index = list.length;
  while (index > 0 && time(list[index - 1]) > time(item)) index--;
  list.splice(index, 0, item);
}

// First index with timestampMs >= `ms`.
function lowerBound(events: readonly ReplayEffectEvent[], ms: number): number {
  let low = 0;
  let high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].timestampMs < ms) low = middle + 1;
    else high = middle;
  }
  return low;
}

// Index of the last time <= `ms`, or -1.
function latestTimeIndex(times: readonly number[], ms: number): number {
  let low = 0;
  let high = times.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (times[middle] <= ms) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

/** Half-open index range [start, end) of events with fromMs <= timestampMs <= toMs. */
export function eventWindow(events: readonly ReplayEffectEvent[], fromMs: number, toMs: number): [number, number] {
  const start = lowerBound(events, fromMs);
  let end = lowerBound(events, toMs);
  while (end < events.length && events[end].timestampMs === toMs) end++;
  return [start, Math.max(start, end)];
}

/** Whether `guid` died at or before `cursorMs` and has not been resurrected since. */
export function isDeadAt(fx: EncounterEffects, guid: string, cursorMs: number): boolean {
  const deaths = fx.deathsByUnit.get(guid);
  if (!deaths) return false;
  const death = latestTimeIndex(deaths, cursorMs);
  if (death < 0) return false;
  const resurrects = fx.resurrectsByUnit.get(guid);
  const resurrect = resurrects ? latestTimeIndex(resurrects, cursorMs) : -1;
  return resurrect < 0 || resurrects![resurrect] < deaths[death];
}

// Reused across calls so a frame's derivation allocates nothing once warm.
const castEnded = new Set<string>();

/**
 * The effects visible at `cursorMs`, newest first, at most `maxEffects`.
 * `out` is reused (its objects too) so per-frame callers don't allocate.
 */
export function deriveActiveEffects(
  fx: EncounterEffects,
  cursorMs: number,
  options: DeriveEffectsOptions = DEFAULT_EFFECT_OPTIONS,
  out: ActiveEffect[] = [],
): ActiveEffect[] {
  let count = 0;
  const { filterGuids, priorityGuids, visibleGuids, maxEffects } = options;
  const visible = (guid: string) => !visibleGuids || visibleGuids.has(guid);
  const isPriority = (source: string | undefined, target: string) =>
    Boolean(priorityGuids && ((source && priorityGuids.has(source)) || priorityGuids.has(target)));

  let eventMs = 0;
  const emit = (type: ActiveEffectType, source: string | undefined, target: string, progress: number, color: string, intensity: number) => {
    // Merge into a newer effect of the same kind between the same units
    // whose event landed within MERGE_MS (newer events are emitted first).
    for (let index = 0; index < count; index++) {
      const effect = out[index];
      if (effect.type === type && effect.target === target && effect.source === source
        && effect.color === color && effect.eventMs - eventMs <= MERGE_MS) {
        effect.intensity = Math.min(MAX_INTENSITY, effect.intensity + intensity * 0.5);
        return;
      }
    }
    let slot = count;
    if (count >= maxEffects) {
      // Full: a priority effect may displace the oldest non-priority one.
      if (!isPriority(source, target)) return;
      slot = -1;
      for (let index = count - 1; index >= 0; index--) {
        if (!isPriority(out[index].source, out[index].target)) {
          slot = index;
          break;
        }
      }
      if (slot < 0) return;
    } else {
      count++;
    }
    const effect = out[slot] ?? (out[slot] = { type, target, progress, color, intensity, eventMs });
    effect.type = type;
    effect.source = source;
    effect.target = target;
    effect.progress = progress;
    effect.color = color;
    effect.intensity = intensity;
    effect.eventMs = eventMs;
  };

  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - Math.max(options.lookbackMs, CAST_RING_MAX_MS), cursorMs);
  castEnded.clear();
  for (let index = end - 1; index >= start; index--) {
    const event = events[index];
    const ageMs = cursorMs - event.timestampMs;
    eventMs = event.timestampMs;
    // A cast bar ends at the caster's next cast start, cast go or interrupt.
    if (event.kind === "cast_start") {
      const wasEnded = castEnded.has(event.source);
      castEnded.add(event.source);
      if (wasEnded || event.castTimeMs <= 0) continue;
      const durationMs = Math.min(event.castTimeMs, CAST_RING_MAX_MS);
      if (ageMs >= durationMs || !visible(event.source)) continue;
      if (filterGuids && !filterGuids.has(event.source) && !filterGuids.has(event.target)) continue;
      emit("cast", undefined, event.source, ageMs / durationMs, schoolColor(event.school), 1);
      continue;
    }
    if (event.kind === "cast_go") castEnded.add(event.source);
    if (event.kind === "interrupt") castEnded.add(event.target);
    if (ageMs > options.lookbackMs) continue;
    if (filterGuids && !filterGuids.has(event.source) && !filterGuids.has(event.target)) continue;

    switch (event.kind) {
      case "damage":
      case "heal": {
        if (event.periodic && !options.showPeriodic) break;
        if (event.kind === "heal" && !options.showHeals) break;
        const color = schoolColor(event.school);
        const intensity = event.crit ? 2 : 1;
        const beam = !event.melee && event.source !== "" && event.source !== event.target;
        if (beam && ageMs < BEAM_MS && visible(event.source) && visible(event.target)) {
          emit("beam", event.source, event.target, ageMs / BEAM_MS, color, intensity);
        }
        if (event.kind === "damage") {
          const hitMs = event.melee ? MELEE_FLASH_MS : HIT_WOBBLE_MS;
          if (ageMs < hitMs && visible(event.target)) emit("hit", undefined, event.target, ageMs / hitMs, color, intensity);
        }
        break;
      }
      case "cast_go":
        if (event.aoe && ageMs < AOE_RING_MS && visible(event.source)) {
          emit("ring", undefined, event.source, ageMs / AOE_RING_MS, schoolColor(event.school), 1);
        }
        break;
      case "interrupt":
        if (ageMs < INTERRUPT_MS && visible(event.target)) {
          emit("hit", undefined, event.target, ageMs / INTERRUPT_MS, INTERRUPT_COLOR, 2);
        }
        break;
      default:
        break;
    }
  }
  out.length = count;
  return out;
}
