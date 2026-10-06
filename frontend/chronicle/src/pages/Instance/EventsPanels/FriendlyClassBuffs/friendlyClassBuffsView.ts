import type { FriendlyClassBuffSpell, FriendlyClassBuffsByClass } from "@/api/classBuffs";
import type { FriendlyBuffEntityUsage, FriendlyBuffPlayer } from "./friendlyClassBuffs.processor";

export interface FriendlyBuffMatrixColumn {
  key: string;
  name: string;
  spellId: number;
}

export interface FriendlyBuffMatrixCell {
  applications: number;
  otherPlayers: FriendlyBuffPlayer[];
}

export interface FriendlyBuffMatrixRow {
  playerID: string;
  playerName: string;
  className: string;
  applications: number;
  cells: Map<string, FriendlyBuffMatrixCell>;
}

export interface FriendlyBuffMatrix {
  columns: FriendlyBuffMatrixColumn[];
  rows: FriendlyBuffMatrixRow[];
}

export function buildAllowedFriendlyClassBuffs(
  data: FriendlyClassBuffsByClass | undefined,
  className: string | null,
): Map<number, FriendlyClassBuffSpell> {
  const inherited = data?.Generic ?? [];
  const classSpells = className ? data?.[className] ?? [] : [];
  return new Map(
    [...inherited, ...classSpells]
      .filter((spell) => !spell.ignored)
      .map((spell) => [spell.id, spell]),
  );
}

export interface FriendlyBuffMatrixOptions {
  selectedPlayers?: ReadonlySet<string>;
  sourceClassName?: string | null;
  sourceIsEntity?: boolean;
}

function normalizedClassName(className: string): string {
  return className.toUpperCase().replace(/[^A-Z]/g, "");
}

export function buildFriendlyBuffMatrix(
  entities: ReadonlyMap<string, FriendlyBuffEntityUsage>,
  allowedSpells: ReadonlyMap<number, FriendlyClassBuffSpell>,
  options: FriendlyBuffMatrixOptions = {},
): FriendlyBuffMatrix {
  const columns = new Map<string, FriendlyBuffMatrixColumn>();
  const rows: FriendlyBuffMatrixRow[] = [];
  const selectedPlayers = options.selectedPlayers ?? new Set<string>();
  const sourceClassName = options.sourceClassName ? normalizedClassName(options.sourceClassName) : null;
  const sourceIsEntity = options.sourceIsEntity ?? true;

  for (const entity of entities.values()) {
    if (selectedPlayers.size > 0 && !selectedPlayers.has(entity.entityID)) continue;
    if (sourceIsEntity && sourceClassName && normalizedClassName(entity.className) !== sourceClassName) continue;

    const cells = new Map<string, FriendlyBuffMatrixCell>();
    let applications = 0;

    for (const [spellId, usage] of entity.bySpell) {
      const spell = allowedSpells.get(spellId);
      if (!spell) continue;

      const players = [...usage.otherPlayers.values()].filter((player) => (
        sourceIsEntity || !sourceClassName || normalizedClassName(player.className) === sourceClassName
      ));
      const usageApplications = sourceIsEntity
        ? usage.applications
        : players.reduce((total, player) => total + player.applications, 0);
      if (usageApplications === 0) continue;

      const key = spell.name;
      if (!columns.has(key)) columns.set(key, { key, name: spell.name, spellId });

      const cell = cells.get(key) ?? { applications: 0, otherPlayers: [] };
      const playersByID = new Map(cell.otherPlayers.map((player) => [player.playerID, player]));
      for (const player of players) {
        const existing = playersByID.get(player.playerID);
        if (existing) existing.applications += player.applications;
        else playersByID.set(player.playerID, { ...player });
      }

      cell.applications += usageApplications;
      cell.otherPlayers = [...playersByID.values()].sort(
        (a, b) => b.applications - a.applications || a.playerName.localeCompare(b.playerName),
      );
      cells.set(key, cell);
      applications += usageApplications;
    }

    if (applications > 0) {
      rows.push({
        playerID: entity.entityID,
        playerName: entity.entityName,
        className: entity.className,
        applications,
        cells,
      });
    }
  }

  return {
    columns: [...columns.values()].sort((a, b) => a.name.localeCompare(b.name)),
    rows: rows.sort((a, b) => b.applications - a.applications || a.playerName.localeCompare(b.playerName)),
  };
}
