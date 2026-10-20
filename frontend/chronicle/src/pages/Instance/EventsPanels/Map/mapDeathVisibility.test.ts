import { describe, expect, it } from "vitest";
import {
  DEAD_ENEMY_FRAME_LINGER_MS,
  DEAD_ENEMY_MODEL_FADE_MS,
  deadEnemyFrameVisible,
  deadEnemyModelOpacity,
  deadUnitVisualState,
} from "./mapDeathVisibility";

describe("dead enemy visibility", () => {
  it("hides a non-boss frame after three seconds", () => {
    expect(deadEnemyFrameVisible(1_000, 1_000 + DEAD_ENEMY_FRAME_LINGER_MS - 1, false)).toBe(true);
    expect(deadEnemyFrameVisible(1_000, 1_000 + DEAD_ENEMY_FRAME_LINGER_MS, false)).toBe(false);
    expect(deadEnemyFrameVisible(1_000, 99_000, true)).toBe(true);
  });

  it("fades a non-boss model over five seconds and keeps bosses opaque", () => {
    expect(deadEnemyModelOpacity(1_000, 1_000, false)).toBe(1);
    expect(deadEnemyModelOpacity(1_000, 1_000 + DEAD_ENEMY_MODEL_FADE_MS / 2, false)).toBe(0.5);
    expect(deadEnemyModelOpacity(1_000, 1_000 + DEAD_ENEMY_MODEL_FADE_MS, false)).toBe(0);
    expect(deadEnemyModelOpacity(1_000, 99_000, true)).toBe(1);
  });

  it("removes a slain totem immediately and restores it on resurrection", () => {
    const options = { boss: false, hostileModel: false, totem: true };
    expect(deadUnitVisualState(1_000, 1_000, options)).toEqual({
      unitVisible: false,
      modelOpacity: 0,
      shadowOpacity: 0,
    });
    expect(deadUnitVisualState(null, 2_000, options)).toEqual({
      unitVisible: true,
      modelOpacity: 1,
      shadowOpacity: 1,
    });
  });

  it("fades a slain trash model and its shadow together while keeping bosses visible", () => {
    const halfway = 1_000 + DEAD_ENEMY_MODEL_FADE_MS / 2;
    expect(deadUnitVisualState(1_000, halfway, { boss: false, hostileModel: true, totem: false })).toEqual({
      unitVisible: true,
      modelOpacity: 0.5,
      shadowOpacity: 0.5,
    });
    expect(deadUnitVisualState(1_000, 99_000, { boss: true, hostileModel: true, totem: false })).toEqual({
      unitVisible: true,
      modelOpacity: 1,
      shadowOpacity: 1,
    });
  });
});
