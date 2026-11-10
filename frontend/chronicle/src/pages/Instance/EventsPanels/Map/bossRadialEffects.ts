/**
 * Spell-driven radial ground effects for boss mechanics on the replay map.
 *
 * Keep mechanic-specific spell IDs and dimensions here. The renderer consumes
 * the derived radius in world yards and remains unaware of individual bosses.
 */

export interface BossRadialEffectDefinition {
  /** Stable name used by tests and future presentation metadata. */
  key: string;
  /** Spell completion IDs that emit the radial pulse. */
  spellIds: readonly number[];
  /** Authoritative effect radius from spell data. */
  radiusYards: number;
  /** How long the ring expands and fades after the spell completes. */
  durationMs: number;
  /** CSS/three.js colour for the ground ring. */
  color: string;
}

export const FIRE_NOVA_SPELL_ID = 11_970;
export const FIRE_NOVA_RADIUS_YARDS = 10;
export const FIRE_NOVA_DURATION_MS = 800;
export const FIRE_NOVA_COLOR = "#ff6a00";

/** Add future radial boss mechanics as one entry per spell display. */
export const BOSS_RADIAL_EFFECTS: readonly BossRadialEffectDefinition[] = [
  {
    key: "taragaman-fire-nova",
    spellIds: [FIRE_NOVA_SPELL_ID],
    radiusYards: FIRE_NOVA_RADIUS_YARDS,
    durationMs: FIRE_NOVA_DURATION_MS,
    color: FIRE_NOVA_COLOR,
  },
];

const definitionsBySpellId = new Map(BOSS_RADIAL_EFFECTS.flatMap((definition) =>
  definition.spellIds.map((spellId) => [spellId, definition] as const),
));

export function bossRadialEffectForSpell(spellId: number): BossRadialEffectDefinition | null {
  return definitionsBySpellId.get(spellId) ?? null;
}

export const MAX_BOSS_RADIAL_DURATION_MS = Math.max(...BOSS_RADIAL_EFFECTS.map(({ durationMs }) => durationMs));
