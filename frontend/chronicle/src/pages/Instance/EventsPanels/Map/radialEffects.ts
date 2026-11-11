/**
 * Spell-driven radial effects on the replay map, shared by player abilities
 * and boss mechanics. Keep spell IDs and dimensions here; the renderer consumes
 * the derived shape and radius without knowing which unit cast the spell.
 */

export type RadialEffectShape = "ring" | "sphere";

export interface RadialEffectDefinition {
  /** Stable name used by tests and future presentation metadata. */
  key: string;
  /** Spell completion IDs that emit the radial pulse. */
  spellIds: readonly number[];
  /** Authoritative effect radius from spell data. */
  radiusYards: number;
  /** How long the effect expands and fades after the spell completes. */
  durationMs: number;
  /** CSS/three.js colour for the effect. */
  color: string;
  /** Ground ring for planar attacks; sphere for effects expanding around the caster. */
  shape: RadialEffectShape;
}

export const FIRE_NOVA_SPELL_ID = 11_970;
export const FIRE_NOVA_RADIUS_YARDS = 10;
export const FIRE_NOVA_DURATION_MS = 800;
export const FIRE_NOVA_COLOR = "#ff6a00";

export const ARCANE_EXPLOSION_SPELL_ID = 9_433;
export const PLAYER_ARCANE_EXPLOSION_SPELL_IDS = [1_449, 8_437, 8_438, 8_439, 10_201, 10_202] as const;
export const ARCANE_EXPLOSION_SPELL_IDS = [ARCANE_EXPLOSION_SPELL_ID, ...PLAYER_ARCANE_EXPLOSION_SPELL_IDS] as const;
export const ARCANE_EXPLOSION_RADIUS_YARDS = 10;
export const ARCANE_EXPLOSION_DURATION_MS = 500;
export const ARCANE_EXPLOSION_COLOR = "#38bdf8";

export const DETONATION_SPELL_ID = 9_435;
export const DETONATION_RADIUS_YARDS = 30;
export const DETONATION_DURATION_MS = 800;
export const DETONATION_COLOR = "#ff6a00";

/** Add future radial spells as one entry per visual behavior. */
export const RADIAL_EFFECTS: readonly RadialEffectDefinition[] = [
  {
    key: "taragaman-fire-nova",
    spellIds: [FIRE_NOVA_SPELL_ID],
    radiusYards: FIRE_NOVA_RADIUS_YARDS,
    durationMs: FIRE_NOVA_DURATION_MS,
    color: FIRE_NOVA_COLOR,
    shape: "ring",
  },
  {
    key: "arcanist-doan-detonation",
    spellIds: [DETONATION_SPELL_ID],
    radiusYards: DETONATION_RADIUS_YARDS,
    durationMs: DETONATION_DURATION_MS,
    color: DETONATION_COLOR,
    shape: "ring",
  },
  {
    key: "arcane-explosion",
    spellIds: ARCANE_EXPLOSION_SPELL_IDS,
    radiusYards: ARCANE_EXPLOSION_RADIUS_YARDS,
    durationMs: ARCANE_EXPLOSION_DURATION_MS,
    color: ARCANE_EXPLOSION_COLOR,
    shape: "sphere",
  },
];

const definitionsBySpellId = new Map(RADIAL_EFFECTS.flatMap((definition) =>
  definition.spellIds.map((spellId) => [spellId, definition] as const),
));

export function radialEffectForSpell(spellId: number): RadialEffectDefinition | null {
  return definitionsBySpellId.get(spellId) ?? null;
}

export const MAX_RADIAL_EFFECT_DURATION_MS = Math.max(...RADIAL_EFFECTS.map(({ durationMs }) => durationMs));
