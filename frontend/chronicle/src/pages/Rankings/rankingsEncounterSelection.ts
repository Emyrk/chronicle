export interface RankingEncounterSection {
  label: "Bosses" | "Optional" | "Trash";
  kind: "boss" | "optional" | "trash";
  names: string[];
}

export function rankingEncounterNames(
  instanceName: string,
  recordedEncounterNames: string[],
  progressionBosses: Map<string, Set<string>> | undefined,
): string[] {
  const canonicalBosses = progressionBosses?.get(instanceName);
  if (canonicalBosses == null) return recordedEncounterNames;

  return [...canonicalBosses, ...recordedEncounterNames.filter((name) => !canonicalBosses.has(name))];
}

export function defaultRankingBossNames(
  instanceName: string,
  encounterNames: string[],
  progressionBosses: Map<string, Set<string>> | undefined,
): Set<string> {
  const allBosses = encounterNames.filter((name) => name !== "Trash");
  const canonicalBosses = progressionBosses?.get(instanceName);
  if (canonicalBosses == null) return new Set(allBosses);
  return new Set(allBosses.filter((name) => canonicalBosses.has(name)));
}

export function rankingEncounterSections(
  encounterNames: string[],
  defaultBossNames: Set<string>,
): RankingEncounterSection[] {
  const sections: RankingEncounterSection[] = [
    {
      label: "Bosses",
      kind: "boss",
      names: encounterNames.filter((name) => defaultBossNames.has(name)),
    },
    {
      label: "Optional",
      kind: "optional",
      names: encounterNames.filter((name) => name !== "Trash" && !defaultBossNames.has(name)),
    },
    {
      label: "Trash",
      kind: "trash",
      names: encounterNames.filter((name) => name === "Trash"),
    },
  ];

  return sections.filter((section) => section.names.length > 0);
}
