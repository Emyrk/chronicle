import type { WoWEncounter } from "@/api/typesGenerated"

export type StripEncounter = Pick<WoWEncounter, "id" | "name" | "boss" | "kill_type" | "start_time" | "end_time">

export const failed = (encounter: StripEncounter) => encounter.kill_type === "wipe" || encounter.kill_type === "reset"

/** Encounters shown in the strip: bosses that died, plus trash and wipes when asked. Selected ones always show. */
export function stripEncounters<T extends StripEncounter>(encounters: readonly T[], options: { trash: boolean; wipes: boolean; selectedIds: readonly string[] }): T[] {
  return encounters.filter(encounter => options.selectedIds.includes(encounter.id) ||
    ((encounter.boss || options.trash) && (!failed(encounter) || options.wipes)))
}
