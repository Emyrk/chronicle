export const DEAD_ENEMY_MODEL_FADE_MS = 5_000;
export const DEAD_ENEMY_FRAME_FADE_MS = DEAD_ENEMY_MODEL_FADE_MS;

function deadEnemyOpacity(deadSinceMs: number | null, cursorMs: number, boss: boolean, fadeMs: number): number {
  if (boss || deadSinceMs === null) return 1;
  return Math.max(0, Math.min(1, 1 - (cursorMs - deadSinceMs) / fadeMs));
}

/** Bosses and living enemies stay opaque; a dead trash enemy's top-right frame fades with its model. */
export function deadEnemyFrameOpacity(deadSinceMs: number | null, cursorMs: number, boss: boolean): number {
  return deadEnemyOpacity(deadSinceMs, cursorMs, boss, DEAD_ENEMY_FRAME_FADE_MS);
}

/** Bosses and living enemies stay opaque; a dead trash enemy's model fades linearly. */
export function deadEnemyModelOpacity(deadSinceMs: number | null, cursorMs: number, boss: boolean): number {
  return deadEnemyOpacity(deadSinceMs, cursorMs, boss, DEAD_ENEMY_MODEL_FADE_MS);
}

export interface DeadUnitVisualState {
  unitVisible: boolean;
  modelOpacity: number;
  shadowOpacity: number;
}

/** Totems vanish on death; trash models and their shadows fade together. */
export function deadUnitVisualState(
  deadSinceMs: number | null,
  cursorMs: number,
  options: { boss: boolean; hostileModel: boolean; totem: boolean },
): DeadUnitVisualState {
  if (options.totem && deadSinceMs !== null) {
    return { unitVisible: false, modelOpacity: 0, shadowOpacity: 0 };
  }
  const modelOpacity = options.hostileModel
    ? deadEnemyModelOpacity(deadSinceMs, cursorMs, options.boss)
    : 1;
  return {
    unitVisible: true,
    modelOpacity,
    shadowOpacity: options.hostileModel ? modelOpacity : 1,
  };
}
