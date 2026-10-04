import type { FriendlyClassBuffSpell } from "@/api/classBuffs";
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

export function buildFriendlyBuffMatrix(
  entities: ReadonlyMap<string, FriendlyBuffEntityUsage>,
  allowedSpells: ReadonlyMap<number, FriendlyClassBuffSpell>,
  selectedPlayers: ReadonlySet<string> = new Set(),
): FriendlyBuffMatrix {
  const columns = new Map<string, FriendlyBuffMatrixColumn>();
  const rows: FriendlyBuffMatrixRow[] = [];

  for (const entity of entities.values()) {
    if (selectedPlayers.size > 0 && !selectedPlayers.has(entity.entityID)) continue;

    const cells = new Map<string, FriendlyBuffMatrixCell>();
    let applications = 0;

    for (const [spellId, usage] of entity.bySpell) {
      const spell = allowedSpells.get(spellId);
      if (!spell) continue;

      const key = spell.name;
      if (!columns.has(key)) columns.set(key, { key, name: spell.name, spellId });

      const cell = cells.get(key) ?? { applications: 0, otherPlayers: [] };
      const players = new Map(cell.otherPlayers.map((player) => [player.playerID, player]));
      for (const player of usage.otherPlayers.values()) {
        const existing = players.get(player.playerID);
        if (existing) existing.applications += player.applications;
        else players.set(player.playerID, { ...player });
      }

      cell.applications += usage.applications;
      cell.otherPlayers = [...players.values()].sort(
        (a, b) => b.applications - a.applications || a.playerName.localeCompare(b.playerName),
      );
      cells.set(key, cell);
      applications += usage.applications;
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
