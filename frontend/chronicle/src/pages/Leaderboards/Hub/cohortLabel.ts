const PLAIN_PLAYER_COUNT = /^\s*(\d+)\s+[\p{L}\p{M} .'-]+\s*$/u

/** Normalizes localized plain player-count labels while preserving qualifiers such as Heroic. */
export function normalizePlayerCountDifficulty(difficulty: string, maxPlayers: number): string {
  const match = difficulty.match(PLAIN_PLAYER_COUNT)
  return match && Number(match[1]) === maxPlayers ? `${maxPlayers} Player` : difficulty
}

/** "10 Player", "Normal · 40", or "Default": a cohort's difficulty and size, without repeating the size. */
export function cohortLabel(row: { difficulty_name: string; max_players: number }): string {
  const difficulty = normalizePlayerCountDifficulty(row.difficulty_name, row.max_players) || "Default"
  return row.max_players > 0 && !difficulty.includes(String(row.max_players)) ? `${difficulty} · ${row.max_players}` : difficulty
}
