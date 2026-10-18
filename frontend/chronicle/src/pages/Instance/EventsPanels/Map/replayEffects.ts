/**
 * Replay Map effects (hit wobble, beams, heals, deaths) derived
 * purely from the replay cursor. Worker-safe: no three.js, no React. Every
 * effect is a function of (events, cursor), so scrubbing in either direction
 * re-derives the same frame and never leaves stale effects behind.
 */

/**
 * Most effect primitives (beams, bolts, slashes, rings) the 3D scene draws at
 * once; also the top "density" setting. Here, not in MapScene3D, so settings
 * code can use it without loading three.js.
 */
export const MAX_EFFECT_PRIMITIVES = 64;

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
  /** Gross amount; for heals this includes overheal. */
  amount: number;
  /** Heals only: the part of `amount` that landed on full health. */
  overheal: number;
  /** Heals only: the part of `amount` soaked by a heal absorb. */
  absorbed: number;
  /** Heals only: `amount - overheal`, the health actually restored. */
  effective: number;
  crit: boolean;
  periodic: boolean;
  attack: ReplayAttackKind;
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
  /** Time-sorted heals with effective healing, per target. */
  healsByUnit: Map<string, ReplayEffectEvent[]>;
}

/**
 * "beam": a spell bolt between units; "streak": a thin ranged auto shot;
 * "lunge": the attacker stepping toward its target; "slash": an arc at the
 * target of a melee hit; "impact": a small burst for melee abilities;
 * "hit": wobble and flash; "heal": a ring rising at a healed target. (A cast in progress is the token's cast arc, not an effect.)
 */
export type ActiveEffectType = "beam" | "streak" | "lunge" | "slash" | "impact" | "hit" | "heal";

export interface ActiveEffect {
  type: ActiveEffectType;
  /** Beam, streak, lunge or slash origin; absent for effects anchored on one unit. */
  source?: string;
  /** The unit the effect is drawn at. */
  target: string;
  /** 0 at the event, approaching 1 as the effect expires. */
  progress: number;
  /** CSS colour, possibly a `var(--token)`. */
  color: string;
  /** 1 for a normal hit; higher for crits and merged hits (capped). */
  intensity: number;
  /** Timestamp of the (newest merged) event that produced the effect. */
  eventMs: number;
  /**
   * The (newest merged) event's kind, spell and amount, for hover tooltips.
   * Heals carry effective healing; a heal pulse sums its merged ticks.
   */
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
  /** Also draw heals that restored no health (grey). */
  showOverheal: boolean;
}

export const DEFAULT_EFFECT_OPTIONS: DeriveEffectsOptions = {
  lookbackMs: 800,
  filterGuids: null,
  priorityGuids: null,
  visibleGuids: null,
  maxEffects: 64,
  showPeriodic: false,
  showHeals: true,
  showOverheal: false,
};

export const BEAM_MS = 350;
export const STREAK_MS = 200;
export const LUNGE_MS = 150;
export const SLASH_MS = 250;
export const IMPACT_MS = 250;
export const MELEE_FLASH_MS = 150;
export const HIT_WOBBLE_MS = 300;
export const CAST_RING_MAX_MS = 3000;
export const INTERRUPT_MS = 400;
export const MERGE_MS = 100;
export const HEAL_PULSE_MS = 500;
/** Heal-over-time ticks on one target this close together share a pulse. */
export const HOT_MERGE_MS = 500;
/** How long healing lingers as a pale chunk on the health bar. */
export const HEAL_CHUNK_MS = 600;
const MAX_INTENSITY = 3;

export const INTERRUPT_COLOR = "#ffffff";
export const RANGED_AUTO_COLOR = "#f5f5f4";
export const HEAL_COLOR = "#4ade80";
export const HEAL_CRIT_COLOR = "#facc15";
export const OVERHEAL_COLOR = "#a8a29e";
/** Spell schools by chronicleproto School value, as `--color-school-<name>` tokens (anything else draws as physical). */
export const SCHOOL_TOKENS: Readonly<Record<number, string>> = {
  2: "physical",
  3: "holy",
  4: "fire",
  5: "nature",
  6: "frost",
  7: "shadow",
  8: "arcane",
};

/** The colour for a spell's school name from its spell data ("Frost" …), or null when it is not one of SCHOOL_TOKENS. */
export function schoolNameColor(name: string | null | undefined): string | null {
  const token = name?.toLowerCase();
  return token && Object.values(SCHOOL_TOKENS).includes(token) ? `var(--color-school-${token})` : null;
}

export function schoolColor(school: number): string {
  return `var(--color-school-${SCHOOL_TOKENS[school] ?? "physical"})`;
}

/**
 * Bolt and pulse size for a heal: grows with log(amount), about 1 at 500
 * and 1.5 at 5k, half again on a crit.
 */
export function healIntensity(amount: number, crit: boolean): number {
  const size = Math.min(2.5, Math.max(0.6, 1 + 0.5 * Math.log10(Math.max(1, amount) / 500)));
  return Math.min(MAX_INTENSITY, crit ? size * 1.5 : size);
}

// Rounded amount -> text; 2 significant figures keep this small.
const healTextCache = new Map<number, string>();

/**
 * "+1.2k": rounded to 2 significant figures so few label textures are
 * needed. Cached, so per-frame callers don't allocate.
 */
export function formatHealAmount(amount: number): string {
  const value = Math.max(0, Math.round(amount));
  const step = value >= 100 ? 10 ** (Math.floor(Math.log10(value)) - 1) : 1;
  const rounded = Math.round(value / step) * step;
  let text = healTextCache.get(rounded);
  if (text === undefined) {
    const digits = (scaled: number) => Number(scaled.toPrecision(2));
    text = rounded >= 1e6 ? `+${digits(rounded / 1e6)}M` : rounded >= 1e3 ? `+${digits(rounded / 1e3)}k` : `+${rounded}`;
    healTextCache.set(rounded, text);
  }
  return text;
}

export function createEncounterEffects(): EncounterEffects {
  return { events: [], deathsByUnit: new Map(), resurrectsByUnit: new Map(), healsByUnit: new Map() };
}

/**
 * Appends an event, keeping `events` time-sorted. Events arrive in index
 * order, which is almost always time order, so this is an O(1) push.
 */
export function addEffectEvent(fx: EncounterEffects, event: ReplayEffectEvent) {
  insertSorted(fx.events, event, (entry) => entry.timestampMs);
  if (event.kind === "slain") pushTime(fx.deathsByUnit, event.target, event.timestampMs);
  if (event.kind === "resurrect") pushTime(fx.resurrectsByUnit, event.target, event.timestampMs);
  if (event.kind === "heal" && event.effective > 0) {
    let heals = fx.healsByUnit.get(event.target);
    if (!heals) {
      heals = [];
      fx.healsByUnit.set(event.target, heals);
    }
    insertSorted(heals, event, (entry) => entry.timestampMs);
  }
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

/**
 * Health `guid` gained from heals in the last HEAL_CHUNK_MS, each heal's
 * share shrinking linearly to zero as it ages: the lagging "heal chunk" on
 * the health bar. A pure function of the cursor.
 */
export function deriveRecentHealGain(fx: EncounterEffects, guid: string, cursorMs: number): number {
  const heals = fx.healsByUnit.get(guid);
  if (!heals) return 0;
  let gain = 0;
  for (let index = lowerBound(heals, cursorMs - HEAL_CHUNK_MS); index < heals.length && heals[index].timestampMs <= cursorMs; index++) {
    gain += heals[index].effective * (1 - (cursorMs - heals[index].timestampMs) / HEAL_CHUNK_MS);
  }
  return gain;
}

/** The latest death at or before `cursorMs`, or null when the unit is alive then. */
export function deathStartedAt(fx: EncounterEffects, guid: string, cursorMs: number): number | null {
  const deaths = fx.deathsByUnit.get(guid);
  if (!deaths) return null;
  const death = latestTimeIndex(deaths, cursorMs);
  if (death < 0) return null;
  const resurrects = fx.resurrectsByUnit.get(guid);
  const resurrect = resurrects ? latestTimeIndex(resurrects, cursorMs) : -1;
  return resurrect < 0 || resurrects![resurrect] < deaths[death] ? deaths[death] : null;
}

/** Whether `guid` died at or before `cursorMs` and has not been resurrected since. */
export function isDeadAt(fx: EncounterEffects, guid: string, cursorMs: number): boolean {
  return deathStartedAt(fx, guid, cursorMs) !== null;
}

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
  let amount = 0;
  // Merges into a newer effect of the same kind between the same units whose
  // event landed within MERGE_MS (newer events are emitted first). Heal
  // pulses add up their healing; heal-over-time ticks merge over HOT_MERGE_MS.
  const merge = (type: ActiveEffectType, source: string | undefined, target: string, color: string, intensity: number) => {
    const windowMs = type === "heal" && origin!.periodic ? HOT_MERGE_MS : MERGE_MS;
    for (let index = 0; index < count; index++) {
      const effect = out[index];
      if (effect.type === type && effect.target === target && effect.source === source
        && effect.color === color && effect.eventMs - eventMs <= windowMs) {
        if (type === "heal") {
          effect.amount += amount;
          effect.intensity = healIntensity(effect.amount, color === HEAL_CRIT_COLOR);
        } else {
          effect.intensity = Math.min(MAX_INTENSITY, effect.intensity + intensity * 0.5);
        }
        return true;
      }
    }
    return false;
  };
  const emit = (type: ActiveEffectType, source: string | undefined, target: string, progress: number, color: string, intensity: number) => {
    if (merge(type, source, target, color, intensity)) return;
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
    effect.amount = amount;
  };

  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - options.lookbackMs, cursorMs);
  for (let index = end - 1; index >= start; index--) {
    const event = events[index];
    const ageMs = cursorMs - event.timestampMs;
    eventMs = event.timestampMs;
    origin = event;
    amount = event.kind === "heal" ? event.effective : event.amount;
    // Cast bars draw as the token's cast arc (deriveUnitCasts), not an effect.
    if (event.kind === "cast_start") continue;
    // Heal-over-time ticks stay around a little longer to merge into a newer pulse.
    const hotTick = event.kind === "heal" && event.periodic && ageMs <= HEAL_PULSE_MS + HOT_MERGE_MS;
    if (ageMs > options.lookbackMs && !hotTick) continue;
    if (filterGuids && !filterGuids.has(event.source) && !filterGuids.has(event.target)) continue;

    switch (event.kind) {
      case "heal": {
        // Effective healing only: pure overheal draws nothing unless asked.
        if (!options.showHeals) break;
        const effective = event.effective > 0;
        if (!effective && !options.showOverheal) break;
        const color = effective ? HEAL_COLOR : OVERHEAL_COLOR;
        const intensity = effective ? healIntensity(event.effective, event.crit) : 0.6;
        // Ticks draw no bolt unless periodic effects are on; every effective
        // heal pulses at its target.
        if ((!event.periodic || options.showPeriodic) && ageMs < BEAM_MS && event.source !== "" && event.source !== event.target
          && visible(event.source) && visible(event.target)) {
          emit("beam", event.source, event.target, ageMs / BEAM_MS, color, intensity);
        }
        if (effective && visible(event.target)) {
          const pulseColor = event.crit ? HEAL_CRIT_COLOR : HEAL_COLOR;
          if (ageMs < HEAL_PULSE_MS) emit("heal", undefined, event.target, ageMs / HEAL_PULSE_MS, pulseColor, intensity);
          else if (event.periodic) merge("heal", undefined, event.target, pulseColor, intensity);
        }
        break;
      }
      case "damage": {
        if (event.periodic && !options.showPeriodic) break;
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
        if (visible(event.target)) {
          if (event.attack === "melee_ability" && ageMs < IMPACT_MS) {
            emit("impact", undefined, event.target, ageMs / IMPACT_MS, color, intensity);
          }
          const hitMs = melee ? MELEE_FLASH_MS : HIT_WOBBLE_MS;
          if (ageMs < hitMs) emit("hit", undefined, event.target, ageMs / hitMs, color, intensity);
        }
        break;
      }
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
  /** A spell name for damage, a rounded amount ("+1.2k") for heals. */
  text: string;
  /** CSS colour, possibly a `var(--token)`. */
  color: string;
  crit: boolean;
  /** 0 at the event, approaching 1 as the text expires. */
  progress: number;
}

/**
 * Floating text over the targets of recent hits, newest first, at most
 * `max`: spell names of damage dealt by `sources` (never basic attacks, nor
 * casters in `suppressNamesFor`), and healing numbers for heals cast by or
 * landing on `healGuids` (green, grey when all overheal).
 * Like deriveActiveEffects, a pure function of the cursor; `out` and its
 * objects are reused.
 */
export function deriveCombatText(
  fx: EncounterEffects,
  cursorMs: number,
  sources: ReadonlySet<string> | null,
  healGuids: ReadonlySet<string> | null,
  suppressNamesFor: ReadonlySet<string> | null,
  options: Pick<DeriveEffectsOptions, "showPeriodic" | "showHeals" | "showOverheal">,
  max: number,
  out: CombatText[] = [],
): CombatText[] {
  let count = 0;
  const [start, end] = eventWindow(fx.events, cursorMs - COMBAT_TEXT_MS, cursorMs);
  for (let index = end - 1; index >= start && count < max; index--) {
    const event = fx.events[index];
    if (event.kind !== "damage" && event.kind !== "heal") continue;
    if (event.periodic && !options.showPeriodic) continue;
    let text: string;
    let color: string;
    if (event.kind === "heal") {
      if (!options.showHeals || !healGuids || (!healGuids.has(event.source) && !healGuids.has(event.target))) continue;
      if (event.effective <= 0 && !options.showOverheal) continue;
      text = formatHealAmount(event.effective > 0 ? event.effective : event.overheal);
      color = event.effective > 0 ? HEAL_COLOR : OVERHEAL_COLOR;
    } else {
      if (!event.spellName || !sources || !sources.has(event.source) || isBasicAttack(event)) continue;
      // Casters showing cast icons show the icon instead of the name.
      if (suppressNamesFor?.has(event.source)) continue;
      text = event.spellName;
      color = schoolColor(event.school);
    }
    const entry = out[count] ?? (out[count] = { target: "", text: "", color: "", crit: false, progress: 0 });
    entry.target = event.target;
    entry.text = text;
    entry.color = color;
    entry.crit = event.crit;
    entry.progress = (cursorMs - event.timestampMs) / COMBAT_TEXT_MS;
    count++;
  }
  out.length = count;
  return out;
}

/** How long an instant cast's (or a finished cast's) icon stays up. */
export const CAST_ICON_MS = 900;
/** Icons shown side by side above one caster, at most. */
export const MAX_CAST_ICONS_PER_UNIT = 2;
/** Groups up to this size get cast icons over every player by default. */
export const SMALL_GROUP_MAX_PLAYERS = 10;
export type CastIconMode = "off" | "selected" | "all";

/**
 * Casters that get a cast icon: bosses plus the players the mode picks.
 * "all" is every player; "selected" is the selection (none selected = bosses
 * only); "off" shows nothing.
 */
export function castIconGuidSet(
  mode: CastIconMode,
  players: readonly string[],
  selected: ReadonlySet<string> | null,
  bosses: ReadonlySet<string> | null,
): Set<string> | null {
  if (mode === "off") return null;
  const out = new Set<string>(bosses ?? []);
  const casters = mode === "all" ? players : selected ?? [];
  for (const guid of casters) out.add(guid);
  return out.size > 0 ? out : null;
}

/**
 * The stored "selected" mode widens to every player when nothing is selected
 * and the group is small (a dungeon); raids keep selected + bosses.
 */
export function effectiveCastIconGuids(
  mode: CastIconMode,
  players: readonly string[],
  selected: ReadonlySet<string> | null,
  bosses: ReadonlySet<string> | null,
): Set<string> | null {
  const widen = mode === "selected" && !selected && players.length <= SMALL_GROUP_MAX_PLAYERS;
  return castIconGuidSet(widen ? "all" : mode, players, selected, bosses);
}

/** Auto attack, Auto Shot and wand Shoot: repeating swings, not casts. */
export const BASIC_ATTACK_SPELL_IDS: ReadonlySet<number> = new Set([6603, 75, 5019]);
// Exact (trimmed, lowercased) names only: "Attack Power" must not match.
const BASIC_ATTACK_NAMES: ReadonlySet<string> = new Set([
  "auto attack", "auto attack (oh)", "auto attack - offhand", "auto shot", "shoot", "melee", "attack",
]);

/**
 * Whether an event is a basic swing, Auto Shot or wand shot, which never
 * floats a spell name or shows a cast icon.
 */
export function isBasicAttack(event: Pick<ReplayEffectEvent, "kind" | "spellId" | "spellName" | "attack">): boolean {
  if (event.spellId != null && BASIC_ATTACK_SPELL_IDS.has(event.spellId)) return true;
  if (event.kind === "damage" && (event.attack === "swing" || event.attack === "ranged_auto")) return true;
  if ((event.kind === "cast_start" || event.kind === "cast_go") && event.spellId == null) return true;
  return BASIC_ATTACK_NAMES.has(event.spellName.trim().toLowerCase());
}

/**
 * Spell ids of every non-basic cast in the encounter, whoever casts them and
 * whatever the cast mode or selection, ordered by first cast time.
 */
export function collectCastSpellIds(events: readonly ReplayEffectEvent[]): number[] {
  const first = new Map<number, number>();
  for (const event of events) {
    if ((event.kind !== "cast_start" && event.kind !== "cast_go") || isBasicAttack(event)) continue;
    const prev = first.get(event.spellId!);
    if (prev === undefined || event.timestampMs < prev) first.set(event.spellId!, event.timestampMs);
  }
  return [...first.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([id]) => id);
}

/** Most icons preloaded, kept well below the scene's icon texture cache. */
export const MAX_PRELOAD_ICONS = 96;

/**
 * Icon urls to preload: one per distinct url, in the order of the spell ids
 * (first cast first), skipping excluded urls (the placeholder), capped.
 */
export function iconPreloadUrls(
  spellIds: readonly number[],
  iconUrl: (spellId: number) => string,
  exclude: ReadonlySet<string> = new Set(),
  max = MAX_PRELOAD_ICONS,
): string[] {
  const out = new Set<string>();
  for (const id of spellIds) {
    if (out.size >= max) break;
    const url = iconUrl(id);
    if (url && !exclude.has(url)) out.add(url);
  }
  return [...out];
}

/** How long an interrupted enemy cast's icon stays up (greyed). */
export const INTERRUPTED_ICON_MS = 800;
/** How long an interrupted player cast's icon stays up (greyed). */
export const INTERRUPTED_PLAYER_ICON_MS = 550;

export interface CastIcon {
  caster: string;
  spellId: number;
  spellName: string;
  /**
   * 0 when the phase began, approaching 1 as it ends: the cast bar while
   * casting, the linger after a cast goes off, the greyed interrupted icon.
   */
  progress: number;
  /** Replay time since the phase began. */
  elapsedMs: number;
  /**
   * "casting" while a cast bar runs; "instant" after a cast goes off;
   * "interrupted" for a while after an interrupt cuts the cast.
   */
  phase: "casting" | "instant" | "interrupted";
  /** Interrupted only: how far the cast bar had run when it was cut (0-1). */
  cutProgress: number;
  /** Whether the caster is an enemy (in `enemyGuids`). */
  enemy: boolean;
}

export interface CastIconOptions {
  /** Kept first when over the cap (bosses). */
  priorityGuids: ReadonlySet<string> | null;
  /** When set, only casts by or on these units ("Only selected"). */
  filterGuids: ReadonlySet<string> | null;
  /** Enemies: their interrupted casts stay up for INTERRUPTED_ICON_MS. */
  enemyGuids?: ReadonlySet<string> | null;
}

/**
 * How a cast ended: it went off, the caster started another cast, an
 * interrupt cut it, or the caster died.
 */
export interface CastEnd {
  how: "go" | "replaced" | "interrupt" | "died";
  timeMs: number;
}

// Reused by castEndedBy so a frame's derivation allocates nothing once warm.
const castEnd: CastEnd = { how: "go", timeMs: 0 };

// How the caster's cast at `index` ended by `end`, or null while it runs. An
// interrupt counts only within the (uncapped) cast time, and only for the
// cast's own spell or an unknown one (the vanilla parser logs id 0).
function castEndedBy(events: readonly ReplayEffectEvent[], index: number, end: number): CastEnd | null {
  const cast = events[index];
  for (let next = index + 1; next < end; next++) {
    const event = events[next];
    let how: CastEnd["how"] | null = null;
    if (event.kind === "interrupt") {
      if (event.target === cast.source && event.timestampMs - cast.timestampMs < cast.castTimeMs
        && (!event.spellId || event.spellId === cast.spellId)) how = "interrupt";
    } else if (event.kind === "slain") {
      if (event.target === cast.source) how = "died";
    } else if (event.source === cast.source && (event.kind === "cast_start" || event.kind === "cast_go") && !isBasicAttack(event)) {
      if (event.kind === "cast_start") how = "replaced";
      else if (event.spellId === cast.spellId) how = "go";
    }
    if (how) {
      castEnd.how = how;
      castEnd.timeMs = event.timestampMs;
      return castEnd;
    }
  }
  return null;
}

/** How far back deriveLastHitTargets looks for a unit's latest hit. */
export const LAST_HIT_LOOKBACK_MS = 10_000;

/**
 * Who each of `sources` last damaged, at or before the cursor (within
 * LAST_HIT_LOOKBACK_MS): the map turns an enemy with no logged facing toward
 * it. Fills and returns `out`.
 */
export function deriveLastHitTargets(
  fx: EncounterEffects,
  cursorMs: number,
  sources: { has: (guid: string) => boolean },
  out: Map<string, string> = new Map(),
): Map<string, string> {
  out.clear();
  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - LAST_HIT_LOOKBACK_MS, cursorMs);
  for (let index = end - 1; index >= start; index--) {
    const event = events[index];
    if (event.kind !== "damage" || !event.target || event.target === event.source || out.has(event.source) || !sources.has(event.source)) continue;
    out.set(event.source, event.target);
  }
  return out;
}

/** A cast bar in progress: how far along (0-1) and its school (for colour). */
export interface UnitCast {
  progress: number;
  /** From the event; cast starts usually carry none (0), so the spell's data fills it in. */
  school: number;
  spellId: number | null;
  spellName: string;
}

/** The longest cast bar UnitCasts looks back for. */
const UNIT_CAST_MAX_MS = 10_000;

/**
 * Each unit's cast bar at the cursor, for the map's unit tokens: the newest
 * cast_start with a cast time that has not yet gone off, been replaced or
 * been cut (interrupt or death). Fills and returns `out`.
 */
export function deriveUnitCasts(fx: EncounterEffects, cursorMs: number, out: Map<string, UnitCast> = new Map()): Map<string, UnitCast> {
  out.clear();
  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - UNIT_CAST_MAX_MS, cursorMs);
  for (let index = end - 1; index >= start; index--) {
    const event = events[index];
    if (event.kind !== "cast_start" || event.castTimeMs <= 0 || out.has(event.source) || isBasicAttack(event)) continue;
    const ageMs = cursorMs - event.timestampMs;
    if (ageMs >= event.castTimeMs || castEndedBy(events, index, end)) continue;
    out.set(event.source, { progress: ageMs / event.castTimeMs, school: event.school, spellId: event.spellId, spellName: event.spellName });
  }
  return out;
}

/**
 * Spell icons above `sources` while they cast, newest first: a cast with a
 * cast time shows from its start until it goes off or is replaced (at most
 * CAST_RING_MAX_MS) and disappears if the caster dies; an interrupted cast
 * stays up greyed for INTERRUPTED_ICON_MS (enemies) or
 * INTERRUPTED_PLAYER_ICON_MS; every cast that goes off shows for
 * CAST_ICON_MS. At most MAX_CAST_ICONS_PER_UNIT per caster and `max` in
 * all; over the cap, priority casters are kept first, then ongoing casts
 * over finished ones, then the newest. Like deriveCombatText, a pure
 * function of the cursor; `out` and its objects are reused.
 */
export function deriveCastIcons(
  fx: EncounterEffects,
  cursorMs: number,
  sources: ReadonlySet<string>,
  max: number,
  out: CastIcon[] = [],
  options: CastIconOptions = { priorityGuids: null, filterGuids: null },
): CastIcon[] {
  let count = 0;
  const { priorityGuids, filterGuids, enemyGuids } = options;
  const events = fx.events;
  const [start, end] = eventWindow(events, cursorMs - CAST_RING_MAX_MS - INTERRUPTED_ICON_MS, cursorMs);
  for (let index = end - 1; index >= start; index--) {
    const event = events[index];
    if (event.kind !== "cast_start" && event.kind !== "cast_go") continue;
    if (!sources.has(event.source) || isBasicAttack(event)) continue;
    if (filterGuids && !filterGuids.has(event.source) && !filterGuids.has(event.target)) continue;
    const ageMs = cursorMs - event.timestampMs;
    const enemy = Boolean(enemyGuids?.has(event.source));
    let phase: CastIcon["phase"];
    let elapsedMs: number;
    let progress: number;
    let cutProgress = 0;
    if (event.kind === "cast_go") {
      if (ageMs >= CAST_ICON_MS) continue;
      phase = "instant";
      elapsedMs = ageMs;
      progress = ageMs / CAST_ICON_MS;
    } else {
      if (event.castTimeMs <= 0) continue;
      const durationMs = Math.min(event.castTimeMs, CAST_RING_MAX_MS);
      const ended = castEndedBy(events, index, end);
      if (ended?.how === "interrupt") {
        const lingerMs = enemy ? INTERRUPTED_ICON_MS : INTERRUPTED_PLAYER_ICON_MS;
        const interruptedMs = cursorMs - ended.timeMs;
        if (interruptedMs >= lingerMs) continue;
        phase = "interrupted";
        elapsedMs = interruptedMs;
        progress = interruptedMs / lingerMs;
        cutProgress = Math.min(1, (ended.timeMs - event.timestampMs) / durationMs);
      } else {
        if (ageMs >= durationMs || ended) continue;
        phase = "casting";
        elapsedMs = ageMs;
        progress = ageMs / durationMs;
      }
    }
  let onCaster = 0;
    for (let shown = 0; shown < count; shown++) {
      if (out[shown].caster === event.source) onCaster++;
    }
    if (onCaster >= MAX_CAST_ICONS_PER_UNIT) continue;
    const icon = out[count] ?? (out[count] = {
      caster: "", spellId: 0, spellName: "", progress: 0, elapsedMs: 0, phase: "instant", cutProgress: 0, enemy: false,
    });
    icon.caster = event.source;
    icon.spellId = event.spellId!;
    icon.spellName = event.spellName;
    icon.progress = progress;
    icon.elapsedMs = elapsedMs;
    icon.phase = phase;
    icon.cutProgress = cutProgress;
    icon.enemy = enemy;
    count++;
  }
  // Over the cap: drop the lowest-ranked icon (non-priority, finished, oldest)
  // until it fits, keeping the rest newest first.
  while (count > max) {
    let drop = -1;
    let dropRank = Infinity;
    for (let index = count - 1; index >= 0; index--) {
      const icon = out[index];
      const rank = (priorityGuids?.has(icon.caster) ? 2 : 0) + (icon.phase === "instant" ? 0 : 1);
      if (rank < dropRank) {
        drop = index;
        dropRank = rank;
      }
    }
    const dropped = out[drop];
    for (let index = drop; index < count - 1; index++) out[index] = out[index + 1];
    out[count - 1] = dropped;
    count--;
  }
  out.length = count;
  return out;
}
