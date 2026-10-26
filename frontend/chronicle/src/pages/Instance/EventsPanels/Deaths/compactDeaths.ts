/** The Deaths panel's compact mode (the Watch preset): one row per player death that seeks the replay. */
export const COMPACT_DEATHS_PANEL_OPTION = "compact";

/** A compact row seeks the replay this long before the death. */
export const COMPACT_DEATH_SEEK_LEAD_MS = 10_000;

export function isCompactDeathsOption(option: string | null | undefined): boolean {
  return (option ?? "").split(",").map((token) => token.trim()).includes(COMPACT_DEATHS_PANEL_OPTION);
}

/** A player death for the compact list. */
export interface CompactDeathRow {
  dateMilli: number;
  encounterID: string;
  playerID: string;
  playerName: string;
  className: string;
  killerName: string;
}

/** The selected encounters' deaths, oldest first. */
export function compactDeathRows(rows: readonly CompactDeathRow[], selectedEncounterIds: readonly string[]): CompactDeathRow[] {
  const selected = new Set(selectedEncounterIds);
  return rows.filter((row) => selected.has(row.encounterID)).sort((left, right) => left.dateMilli - right.dateMilli);
}

/** Elapsed time as m:ss, or h:mm:ss past an hour. */
export function formatDeathClock(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}
