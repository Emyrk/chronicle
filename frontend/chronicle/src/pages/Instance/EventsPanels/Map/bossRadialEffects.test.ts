import { describe, expect, it } from "vitest";
import {
  bossRadialEffectForSpell,
  FIRE_NOVA_COLOR,
  FIRE_NOVA_DURATION_MS,
  FIRE_NOVA_RADIUS_YARDS,
  FIRE_NOVA_SPELL_ID,
  MAX_BOSS_RADIAL_DURATION_MS,
} from "./bossRadialEffects";

describe("bossRadialEffects", () => {
  it("registers Taragaman's Fire Nova dimensions by spell ID", () => {
    expect(bossRadialEffectForSpell(FIRE_NOVA_SPELL_ID)).toEqual({
      key: "taragaman-fire-nova",
      spellIds: [FIRE_NOVA_SPELL_ID],
      radiusYards: FIRE_NOVA_RADIUS_YARDS,
      durationMs: FIRE_NOVA_DURATION_MS,
      color: FIRE_NOVA_COLOR,
    });
    expect(bossRadialEffectForSpell(6603)).toBeNull();
    expect(MAX_BOSS_RADIAL_DURATION_MS).toBe(FIRE_NOVA_DURATION_MS);
  });
});
