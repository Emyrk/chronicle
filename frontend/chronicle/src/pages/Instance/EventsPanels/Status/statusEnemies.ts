import type { StatusUnitSnapshot } from "./statusTimeline";

export const STATUS_ENEMY_FADE_MILLI = 5_000;

export function sortStatusEnemySnapshots(
  snapshots: StatusUnitSnapshot[],
  bossIds: Set<string>,
): StatusUnitSnapshot[] {
  return [...snapshots].sort((a, b) =>
    Number(bossIds.has(b.unit.unitId)) - Number(bossIds.has(a.unit.unitId))
    || a.unit.name.localeCompare(b.unit.name),
  );
}

export function statusEnemyRowOpacity(
  deadSinceMilli: number | null,
  cursorMilli: number,
  hideDead: boolean,
): number | null {
  if (!hideDead || deadSinceMilli === null) return 1;
  const elapsed = Math.max(0, cursorMilli - deadSinceMilli);
  if (elapsed >= STATUS_ENEMY_FADE_MILLI) return null;
  return 1 - elapsed / STATUS_ENEMY_FADE_MILLI;
}
