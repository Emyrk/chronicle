export const DEAD_ENEMY_FRAME_LINGER_MS = 3_000;
export const DEAD_ENEMY_MODEL_FADE_MS = 5_000;

/** Bosses stay visible; a dead trash enemy's frame lingers briefly for recognition. */
export function deadEnemyFrameVisible(deadSinceMs: number | null, cursorMs: number, boss: boolean): boolean {
  return boss || deadSinceMs === null || cursorMs - deadSinceMs < DEAD_ENEMY_FRAME_LINGER_MS;
}

/** Bosses and living enemies stay opaque; a dead trash enemy's model fades linearly. */
export function deadEnemyModelOpacity(deadSinceMs: number | null, cursorMs: number, boss: boolean): number {
  if (boss || deadSinceMs === null) return 1;
  return Math.max(0, Math.min(1, 1 - (cursorMs - deadSinceMs) / DEAD_ENEMY_MODEL_FADE_MS));
}
