import type { DeathEvent, DeathsResult } from "./deaths.processor";

export interface DeathLogSnapshot {
  panelContextVersion: string;
  result: DeathsResult;
}

export function hasDeathLogEvents(result: DeathsResult): boolean {
  return result.DeathEvents.length > 0 || result.EnemyDeathEvents.length > 0;
}

export function selectDeathLogDisplayResult(
  liveResult: DeathsResult,
  snapshot: DeathLogSnapshot | null,
  syncEnabled: boolean,
  panelContextVersion: string,
): DeathsResult {
  if (syncEnabled && snapshot?.panelContextVersion === panelContextVersion) {
    return snapshot.result;
  }
  return liveResult;
}

export function isDeathAheadOfSyncCursor(
  death: DeathEvent,
  syncEnabled: boolean,
  syncTimestamp: Date | null,
): boolean {
  return syncEnabled && syncTimestamp !== null && death.dateMilli > syncTimestamp.getTime();
}
