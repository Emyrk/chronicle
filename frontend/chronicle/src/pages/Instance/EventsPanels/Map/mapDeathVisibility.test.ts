import { describe, expect, it } from "vitest";
import {
  DEAD_ENEMY_FRAME_LINGER_MS,
  DEAD_ENEMY_MODEL_FADE_MS,
  deadEnemyFrameVisible,
  deadEnemyModelOpacity,
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
});
