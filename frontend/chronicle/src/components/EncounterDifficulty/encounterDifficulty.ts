import type { KillType } from "@/api/typesGenerated";

export interface DifficultyEncounter {
  name: string;
  boss: boolean;
  kill_type: KillType;
  difficulty: string;
}

/** Counts successful boss attempts, not unique names; wipes still affect the API mixed flag. */
export function summarizeDifficulty(encounters: readonly DifficultyEncounter[]) {
  const kills = encounters.filter((e) => e.boss && (e.kill_type === "clean" || e.kill_type === "partial"));
  const counts = new Map<string, number>();
  for (const kill of kills) counts.set(kill.difficulty, (counts.get(kill.difficulty) ?? 0) + 1);
  return { kills, counts };
}
