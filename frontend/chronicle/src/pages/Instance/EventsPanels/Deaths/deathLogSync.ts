import type { DeathEvent, DeathsResult } from "./deaths.processor";

export interface DeathLogSnapshot {
  dataContextKey: string;
  result: DeathsResult;
}

export function hasDeathLogEvents(result: DeathsResult): boolean {
  return result.DeathEvents.length > 0 || result.EnemyDeathEvents.length > 0;
}

/**
 * Window size and player/enemy mode are display-only because the processor retains
 * maximum history and both death lists. Normalize them out of the aggregation key
 * so UI changes do not discard the complete encounter snapshot.
 */
export function deathLogDataContextKey(
  panelContextVersion: string,
  panelOption: string | null | undefined,
): string {
  if (!panelOption) return panelContextVersion;
  const dataOption = panelOption
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token && !token.startsWith("w:") && !token.startsWith("m:"))
    .join(",");
  return panelContextVersion.replace(panelOption, dataOption);
}

export function selectDeathLogDisplayResult(
  liveResult: DeathsResult,
  snapshot: DeathLogSnapshot | null,
  dataContextKey: string,
): DeathsResult {
  return snapshot !== null && snapshot.dataContextKey === dataContextKey
    ? snapshot.result
    : liveResult;
}

export function isDeathAheadOfSyncCursor(
  death: DeathEvent,
  syncEnabled: boolean,
  syncTimestamp: Date | null,
): boolean {
  return syncEnabled && syncTimestamp !== null && death.dateMilli > syncTimestamp.getTime();
}
