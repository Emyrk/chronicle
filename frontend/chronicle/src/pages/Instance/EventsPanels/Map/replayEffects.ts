/**
 * Replay Map effects (hit wobble, beams, cast/AoE rings, deaths) derived
 * purely from the replay cursor. Worker-safe: no three.js, no React. Every
 * effect is a function of (events, cursor), so scrubbing in either direction
 * re-derives the same frame and never leaves stale effects behind.
 */

export type ReplayEffectKind = "damage" | "heal" | "cast_start" | "cast_go" | "interrupt" | "slain" | "resurrect";

/**
 * How a hit was delivered: a weapon swing, a melee-range physical ability, a
 * ranged auto attack (Auto Shot, wand), or anything else (spells, heals).
 */
export type ReplayAttackKind = "swing" | "melee_ability" | "ranged_auto" | "spell";

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
  attack: ReplayAttackKind;
  aoe: boolean;
  castTimeMs: number;
  spellId: number | null;
  /** Spell name as logged ("" when unknown). */
  spellName: string;
}

export interface EncounterEffects {
  /** Time-sorted. */
  events: ReplayEffectEvent[];
  /** Time-sorted death and resurrection timestamps per unit. */
  deathsByUnit: Map<string, number[]>;
  resurrectsByUnit: Map<string, number[]>;
}

/**
 * "beam": a spell bolt between units; "streak": a thin ranged auto shot;
 * "lunge": the attacker stepping toward its target; "slash": an arc at the
 * target of a melee hit; "impact": a small burst for melee abilities;
 * "hit": wobble and flash; "ring": an AoE pulse; "cast": a closing cast ring.
 */
export type ActiveEffectType = "beam" | "streak" | "lunge" | "slash" | "impact" | "hit" | "ring" | "cast";

export interface ActiveEffect {
  type: ActiveEffectType;
  /** Beam, streak, lunge or slash origin; absent for effects anchored on one unit. */
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
  /** The (newest merged) event's kind, spell and amount, for hover tooltips. */
  eventKind: ReplayEffectKind;
  spellId: number | null;
  spellName: string;
  amount: number;
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
export const STREAK_MS = 200;
export const LUNGE_MS = 150;
export const SLASH_MS = 250;
export const IMPACT_MS = 250;
export const MELEE_FLASH_MS = 150;
export const HIT_WOBBLE_MS = 300;
export const AOE_RING_MS = 600;
export const CAST_RING_MAX_MS = 3000;
export const INTERRUPT_MS = 400;
export const MERGE_MS = 100;
const MAX_INTENSITY = 3;

export const INTERRUPT_COLOR = "#ffffff";
export const RANGED_AUTO_COLOR = "#f5f5f4";
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

  let origin: ReplayEffectEvent | null = null;
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
    const effect = out[slot] ?? (out[slot] = {
      type, target, progress, color, intensity, eventMs, eventKind: "damage", spellId: null, spellName: "", amount: 0,
    });
    effect.type = type;
    effect.source = source;
    effect.target = target;
    effect.progress = progress;
    effect.color = color;
    effect.intensity = intensity;
    effect.eventMs = eventMs;
    effect.eventKind = origin!.kind;
    effect.spellId = origin!.spellId;
    effect.spellName = origin!.spellName;
    effect.amount = origin!.amount;
  };

  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - Math.max(options.lookbackMs, CAST_RING_MAX_MS), cursorMs);
  castEnded.clear();
  for (let index = end - 1; index >= start; index--) {
    const event = events[index];
    const ageMs = cursorMs - event.timestampMs;
    eventMs = event.timestampMs;
    origin = event;
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
        const between = event.source !== "" && event.source !== event.target
          && visible(event.source) && visible(event.target);
        const melee = event.attack === "swing" || event.attack === "melee_ability";
        if (between) {
          if (event.attack === "spell" && ageMs < BEAM_MS) {
            emit("beam", event.source, event.target, ageMs / BEAM_MS, color, intensity);
          } else if (event.attack === "ranged_auto" && ageMs < STREAK_MS) {
            emit("streak", event.source, event.target, ageMs / STREAK_MS, RANGED_AUTO_COLOR, intensity);
          } else if (melee) {
            if (ageMs < LUNGE_MS) emit("lunge", event.source, event.target, ageMs / LUNGE_MS, color, 1);
            if (ageMs < SLASH_MS) emit("slash", event.source, event.target, ageMs / SLASH_MS, color, intensity);
          }
        }
        if (event.kind === "damage" && visible(event.target)) {
          if (event.attack === "melee_ability" && ageMs < IMPACT_MS) {
            emit("impact", undefined, event.target, ageMs / IMPACT_MS, color, intensity);
          }
          const hitMs = melee ? MELEE_FLASH_MS : HIT_WOBBLE_MS;
          if (ageMs < hitMs) emit("hit", undefined, event.target, ageMs / hitMs, color, intensity);
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

export const COMBAT_TEXT_MS = 1_000;

export interface CombatText {
  target: string;
  spellName: string;
  /** CSS colour, possibly a `var(--token)`. */
  color: string;
  crit: boolean;
  /** 0 at the event, approaching 1 as the text expires. */
  progress: number;
}

/**
 * Spell names floating over the targets of recent damage and heals cast by
 * `sources`, newest first, at most `max`. Like deriveActiveEffects, a pure
 * function of the cursor; `out` and its objects are reused.
 */
export function deriveCombatText(
  fx: EncounterEffects,
  cursorMs: number,
  sources: ReadonlySet<string>,
  options: Pick<DeriveEffectsOptions, "showPeriodic" | "showHeals">,
  max: number,
  out: CombatText[] = [],
): CombatText[] {
  let count = 0;
  const [start, end] = eventWindow(fx.events, cursorMs - COMBAT_TEXT_MS, cursorMs);
  for (let index = end - 1; index >= start && count < max; index--) {
    const event = fx.events[index];
    if (event.kind !== "damage" && event.kind !== "heal") continue;
    if (!event.spellName || !sources.has(event.source)) continue;
    if (event.periodic && !options.showPeriodic) continue;
    if (event.kind === "heal" && !options.showHeals) continue;
    const text = out[count] ?? (out[count] = { target: "", spellName: "", color: "", crit: false, progress: 0 });
    text.target = event.target;
    text.spellName = event.spellName;
    text.color = schoolColor(event.school);
    text.crit = event.crit;
    text.progress = (cursorMs - event.timestampMs) / COMBAT_TEXT_MS;
    count++;
  }
  out.length = count;
  return out;
}

/** How long an instant cast's (or a finished cast's) icon stays up. */
export const CAST_ICON_MS = 700;
/** Icons shown side by side above one caster, at most. */
export const MAX_CAST_ICONS_PER_UNIT = 2;
/** Auto attack, Auto Shot and wand Shoot: repeating swings, not casts. */
export const CAST_ICON_SKIP_SPELLS: ReadonlySet<number> = new Set([6603, 75, 5019]);

export interface CastIcon {
  caster: string;
  spellId: number;
  /** 0 at the cast start (or instant cast), approaching 1 as the icon expires. */
  progress: number;
  /** "casting" while a cast bar runs; "instant" after a cast goes off. */
  phase: "casting" | "instant";
}

const showsCastIcon = (event: ReplayEffectEvent) =>
  event.spellId != null && !CAST_ICON_SKIP_SPELLS.has(event.spellId);

// Whether the caster's cast at `index` ended by `end`: their next cast start,
// the same spell going off, or an interrupt.
function castEndedBy(events: readonly ReplayEffectEvent[], index: number, end: number): boolean {
  const cast = events[index];
  for (let next = index + 1; next < end; next++) {
    const event = events[next];
    if (event.kind === "interrupt") {
      if (event.target === cast.source) return true;
      continue;
    }
    if (event.source !== cast.source || !showsCastIcon(event)) continue;
    if (event.kind === "cast_start" || (event.kind === "cast_go" && event.spellId === cast.spellId)) return true;
  }
  return false;
}

/**
 * Spell icons above `sources` while they cast, newest first: a cast with a
 * cast time shows until it goes off, is interrupted or replaced (at most
 * CAST_RING_MAX_MS), and every cast that goes off shows for CAST_ICON_MS.
 * At most MAX_CAST_ICONS_PER_UNIT per caster and `max` in all. Like
 * deriveCombatText, a pure function of the cursor; `out` and its objects
 * are reused.
 */
export function deriveCastIcons(
  fx: EncounterEffects,
  cursorMs: number,
  sources: ReadonlySet<string>,
  max: number,
  out: CastIcon[] = [],
): CastIcon[] {
  let count = 0;
  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - CAST_RING_MAX_MS, cursorMs);
  for (let index = end - 1; index >= start && count < max; index--) {
    const event = events[index];
    if (event.kind !== "cast_start" && event.kind !== "cast_go") continue;
    if (!sources.has(event.source) || !showsCastIcon(event)) continue;
    const ageMs = cursorMs - event.timestampMs;
    let progress: number;
    if (event.kind === "cast_go") {
      if (ageMs >= CAST_ICON_MS) continue;
      progress = ageMs / CAST_ICON_MS;
    } else {
      if (event.castTimeMs <= 0) continue;
      const durationMs = Math.min(event.castTimeMs, CAST_RING_MAX_MS);
      if (ageMs >= durationMs || castEndedBy(events, index, end)) continue;
      progress = ageMs / durationMs;
    }
    let onCaster = 0;
    for (let shown = 0; shown < count; shown++) {
      if (out[shown].caster === event.source) onCaster++;
    }
    if (onCaster >= MAX_CAST_ICONS_PER_UNIT) continue;
    const icon = out[count] ?? (out[count] = { caster: "", spellId: 0, progress: 0, phase: "instant" });
    icon.caster = event.source;
    icon.spellId = event.spellId!;
    icon.progress = progress;
    icon.phase = event.kind === "cast_start" ? "casting" : "instant";
    count++;
  }
  out.length = count;
  return out;
}
