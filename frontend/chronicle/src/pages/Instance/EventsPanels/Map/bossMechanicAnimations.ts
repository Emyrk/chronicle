/**
 * Spell-driven animation overrides for original game models on the replay map.
 *
 * Keep boss-specific mechanic displays here instead of adding spell checks to
 * the scene. The map processor records matching aura lifetimes, and animation
 * selection remains a pure function of the replay cursor so pause and scrub
 * always produce the same pose.
 */

export interface BossMechanicAnimationDefinition {
  /** Stable name used in animation state keys and tests. */
  key: string;
  /** Aura spell IDs that activate this display. */
  spellIds: readonly number[];
  /** Ordered game-model clip fallbacks, best match first. */
  candidates: readonly string[];
  /** Whether the selected clip repeats for the aura's lifetime. */
  loop: boolean;
}

export interface BossMechanicAnimationInterval {
  definitionKey: string;
  spellId: number;
  startMs: number;
  endMs: number;
}

export interface ActiveBossMechanicAnimation {
  definition: BossMechanicAnimationDefinition;
  startedAtMs: number;
}

/** Add future bosses as one entry per mechanic. */
export const BOSS_MECHANIC_ANIMATIONS: readonly BossMechanicAnimationDefinition[] = [
  {
    key: "herod-whirlwind",
    spellIds: [8989],
    candidates: ["Whirlwind"],
    loop: true,
  },
];

const definitionsByKey = new Map(BOSS_MECHANIC_ANIMATIONS.map((definition) => [definition.key, definition]));
const definitionsBySpellId = new Map(BOSS_MECHANIC_ANIMATIONS.flatMap((definition) =>
  definition.spellIds.map((spellId) => [spellId, definition] as const),
));

export function bossMechanicAnimationForSpell(spellId: number): BossMechanicAnimationDefinition | null {
  return definitionsBySpellId.get(spellId) ?? null;
}

/**
 * Records an apply/refresh/remove transition for a configured mechanic aura.
 * Returns false for spells with no display mapping, so callers can cheaply
 * ignore the rest of the aura stream.
 */
export function recordBossMechanicAnimationAura(
  intervalsByUnit: Map<string, BossMechanicAnimationInterval[]>,
  unitGuid: string,
  spellId: number,
  timestampMs: number,
  active: boolean,
): boolean {
  const definition = bossMechanicAnimationForSpell(spellId);
  if (!definition) return false;

  let intervals = intervalsByUnit.get(unitGuid);
  if (!intervals) {
    intervals = [];
    intervalsByUnit.set(unitGuid, intervals);
  }
  let open: BossMechanicAnimationInterval | undefined;
  for (let index = intervals.length - 1; index >= 0; index--) {
    const interval = intervals[index];
    if (interval.definitionKey === definition.key && interval.endMs === Infinity) {
      open = interval;
      break;
    }
  }
  if (open) open.endMs = timestampMs;
  if (active) intervals.push({ definitionKey: definition.key, spellId, startMs: timestampMs, endMs: Infinity });
  return true;
}

export function activeBossMechanicAnimation(
  intervalsByUnit: ReadonlyMap<string, readonly BossMechanicAnimationInterval[]>,
  unitGuid: string,
  cursorMs: number,
): ActiveBossMechanicAnimation | null {
  const intervals = intervalsByUnit.get(unitGuid);
  if (!intervals) return null;
  for (let index = intervals.length - 1; index >= 0; index--) {
    const interval = intervals[index];
    if (interval.startMs > cursorMs || cursorMs >= interval.endMs) continue;
    const definition = definitionsByKey.get(interval.definitionKey);
    if (definition) return { definition, startedAtMs: interval.startMs };
  }
  return null;
}
