import type { GuildEncounterKill } from "@/api/typesGenerated";

export function filterCanonicalProgressionEncounters(
  encounters: GuildEncounterKill[],
  progressionBosses: Map<string, Set<string>> | undefined,
): GuildEncounterKill[] {
  return encounters.filter((encounter) => {
    const canonical = progressionBosses?.get(encounter.instance_name);
    return canonical == null || canonical.has(encounter.encounter_name);
  });
}
