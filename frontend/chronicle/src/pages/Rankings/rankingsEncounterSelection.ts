export interface RankingEncounterSection {
  label: "Bosses" | "Optional" | "Trash";
  kind: "boss" | "optional" | "trash";
  names: string[];
}

export function rankingEncounterNames(
  recordedEncounterNames: string[],
  progressionBosses?: Iterable<string>,
  configuredEncounterNames: Iterable<string> = [],
): string[] {
  const canonicalNames = new Set([
    ...(progressionBosses ?? []),
    ...configuredEncounterNames,
  ]);
  if (canonicalNames.size === 0) return recordedEncounterNames;

  return [...canonicalNames, ...recordedEncounterNames.filter((name) => !canonicalNames.has(name))];
}

export function defaultRankingBossNames(
  encounterNames: string[],
  defaultEncounterNames?: Iterable<string>,
): Set<string> {
  const configuredNames = defaultEncounterNames == null ? null : new Set(defaultEncounterNames);
  return new Set(
    encounterNames.filter((name) =>
      name !== "Trash" && (configuredNames == null || configuredNames.has(name)),
    ),
  );
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
