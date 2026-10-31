import type { TimeParseSpread } from "@/api/typesGenerated";
import type { Encounter } from "./InstancePage";

/** The pull's ranked length: the ranking window when there is one, else the whole pull. */
export function pullDurationMs(encounter: Encounter): number {
  if (encounter.ranking_window) return encounter.ranking_window.end_offset_ms - encounter.ranking_window.start_offset_ms;
  return Date.parse(encounter.end_time) - Date.parse(encounter.start_time);
}

/** The server's kill-time spread for a boss, preferring the same difficulty and raid size. */
export function findBossSpread(
  spreads: readonly TimeParseSpread[] | undefined,
  encounterName: string,
  difficultyName: string | undefined,
  maxPlayers: number | undefined,
): TimeParseSpread | undefined {
  const sameBoss = (spreads ?? []).filter((spread) => spread.kind === "boss_kill" && spread.encounter_name === encounterName);
  const spread =
    sameBoss.find((item) => item.difficulty_name === difficultyName && item.max_players === maxPlayers) ?? sameBoss[0];
  return spread && spread.sample_size > 0 ? spread : undefined;
}
