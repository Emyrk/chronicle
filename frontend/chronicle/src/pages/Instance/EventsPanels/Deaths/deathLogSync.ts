import type { DeathEvent, DeathsResult } from "./deaths.processor";

export function hasDeathLogEvents(result: DeathsResult): boolean {
  return result.DeathEvents.length > 0 || result.EnemyDeathEvents.length > 0;
}

/**
 * The Death Log always shows the complete encounter (syncDataMode "full").
 * During Sync playback, deaths that have not happened yet stay visible but
 * render muted until the playhead reaches them.
 */
export function isDeathAheadOfSyncCursor(
  death: DeathEvent,
  syncEnabled: boolean,
  syncTimestamp: Date | null,
): boolean {
  return syncEnabled && syncTimestamp !== null && death.dateMilli > syncTimestamp.getTime();
}
