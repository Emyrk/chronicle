/** "10 Player", "Normal · 40", or "Default": a cohort's difficulty and size, without repeating the size. */
export function cohortLabel(row: { difficulty_name: string; max_players: number }): string {
  const difficulty = row.difficulty_name || "Default"
  return row.max_players > 0 && !difficulty.includes(String(row.max_players)) ? `${difficulty} · ${row.max_players}` : difficulty
}
