import type { Encounter } from "./InstancePage";

export interface TrashGroup {
  name: string;
  encounters: Encounter[];
  kills: number;
  wipes: number;
}

/** Groups trash pulls by name for the encounter sidebar. */
export function groupTrashEncounters(encounters: Encounter[]): TrashGroup[] {
  const trashEncounters = encounters.filter((e) => !e.boss);
  const groups = new Map<string, Encounter[]>();

  for (const encounter of trashEncounters) {
    const existing = groups.get(encounter.name) || [];
    existing.push(encounter);
    groups.set(encounter.name, existing);
  }

  return Array.from(groups.entries()).map(([name, encs]) => ({
    name,
    encounters: encs,
    kills: encs.filter((e) => e.kill_type !== "wipe" && e.kill_type !== "reset").length,
    wipes: encs.filter((e) => e.kill_type === "wipe").length,
  }));
}
