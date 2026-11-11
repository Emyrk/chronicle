import { describe, expect, it } from "vitest";
import {
  ARCANE_EXPLOSION_COLOR,
  ARCANE_EXPLOSION_DURATION_MS,
  ARCANE_EXPLOSION_RADIUS_YARDS,
  ARCANE_EXPLOSION_SPELL_ID,
  ARCANE_EXPLOSION_SPELL_IDS,
  radialEffectForSpell,
  DETONATION_COLOR,
  DETONATION_DURATION_MS,
  DETONATION_RADIUS_YARDS,
  DETONATION_SPELL_ID,
  FIRE_NOVA_COLOR,
  FIRE_NOVA_DURATION_MS,
  FIRE_NOVA_RADIUS_YARDS,
  FIRE_NOVA_SPELL_ID,
  MAX_RADIAL_EFFECT_DURATION_MS,
  PLAYER_ARCANE_EXPLOSION_SPELL_IDS,
} from "./radialEffects";

describe("radialEffects", () => {
  it.each([
    {
      name: "Taragaman's Fire Nova",
      spellId: FIRE_NOVA_SPELL_ID,
      spellIds: [FIRE_NOVA_SPELL_ID],
      key: "taragaman-fire-nova",
      radiusYards: FIRE_NOVA_RADIUS_YARDS,
      durationMs: FIRE_NOVA_DURATION_MS,
      color: FIRE_NOVA_COLOR,
      shape: "ring" as const,
    },
    {
      name: "Arcanist Doan's Detonation",
      spellId: DETONATION_SPELL_ID,
      spellIds: [DETONATION_SPELL_ID],
      key: "arcanist-doan-detonation",
      radiusYards: DETONATION_RADIUS_YARDS,
      durationMs: DETONATION_DURATION_MS,
      color: DETONATION_COLOR,
      shape: "ring" as const,
    },
    {
      name: "Arcanist Doan's Arcane Explosion",
      spellId: ARCANE_EXPLOSION_SPELL_ID,
      spellIds: ARCANE_EXPLOSION_SPELL_IDS,
      key: "arcane-explosion",
      radiusYards: ARCANE_EXPLOSION_RADIUS_YARDS,
      durationMs: ARCANE_EXPLOSION_DURATION_MS,
      color: ARCANE_EXPLOSION_COLOR,
      shape: "sphere" as const,
    },
    {
      name: "a player's Arcane Explosion",
      spellId: PLAYER_ARCANE_EXPLOSION_SPELL_IDS[0],
      spellIds: ARCANE_EXPLOSION_SPELL_IDS,
      key: "arcane-explosion",
      radiusYards: ARCANE_EXPLOSION_RADIUS_YARDS,
      durationMs: ARCANE_EXPLOSION_DURATION_MS,
      color: ARCANE_EXPLOSION_COLOR,
      shape: "sphere" as const,
    },
  ])("registers $name dimensions by spell ID", ({ spellId, spellIds, key, radiusYards, durationMs, color, shape }) => {
    expect(radialEffectForSpell(spellId)).toEqual({
      key,
      spellIds,
      radiusYards,
      durationMs,
      color,
      shape,
    });
  });

  it("ignores unrelated spells and exposes the longest radial lifetime", () => {
    expect(radialEffectForSpell(6603)).toBeNull();
    expect(MAX_RADIAL_EFFECT_DURATION_MS).toBe(Math.max(
      FIRE_NOVA_DURATION_MS,
      ARCANE_EXPLOSION_DURATION_MS,
      DETONATION_DURATION_MS,
    ));
  });
});
