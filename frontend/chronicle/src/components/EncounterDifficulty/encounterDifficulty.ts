import type { KillType } from "@/api/typesGenerated";
import { cn } from "@/lib/utils";

export const CHIP = "inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 ring-inset";
export const HEROIC_CHIP = "bg-purple-500/20 text-purple-200 ring-purple-400/40";
export const VARIANT_CHIP = "bg-amber-500/15 text-amber-200 ring-amber-400/40";
const NORMAL_CHIP = "bg-slate-500/15 text-slate-200 ring-slate-400/40";

/** Shared chip styling for callers that render a difficulty as their own element, such as a toggle. */
export function difficultyChipClassName(difficulty: string): string {
  return cn(CHIP, difficulty === "" ? NORMAL_CHIP : difficulty === "heroic" ? HEROIC_CHIP : VARIANT_CHIP);
}

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
