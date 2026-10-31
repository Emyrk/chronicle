import type { Encounter } from "./InstancePage";

/** The pull's ranked length: the ranking window when there is one, else the whole pull. */
export function pullDurationMs(encounter: Encounter): number {
  if (encounter.ranking_window) return encounter.ranking_window.end_offset_ms - encounter.ranking_window.start_offset_ms;
  return Date.parse(encounter.end_time) - Date.parse(encounter.start_time);
}
