import { consumableDisplayName, type ConsumableUse } from "./consumables.processor";

export interface ConsumableCount {
  key: string;
  count: number;
  spellId: number | null;
  itemId: number | null;
  name: string;
}

export interface PlayerConsumablesTotal {
  playerId: string;
  total: number;
  consumes: ConsumableCount[];
}

function consumeKey(use: ConsumableUse): string {
  if (use.spellId !== null) return `spell:${use.spellId}`;
  if (use.itemId !== null) return `item:${use.itemId}`;
  if (use.candidateItemIds.length === 1) return `item:${use.candidateItemIds[0]}`;
  return `name:${consumableDisplayName(use)}`;
}

/** Groups physical consume uses by player, then by known spell/item identity. */
export function aggregateConsumablesTotal(uses: Iterable<ConsumableUse>): PlayerConsumablesTotal[] {
  const players = new Map<string, { total: number; consumes: Map<string, ConsumableCount> }>();

  for (const use of uses) {
    let player = players.get(use.player);
    if (!player) {
      player = { total: 0, consumes: new Map() };
      players.set(use.player, player);
    }

    player.total += 1;
    const key = consumeKey(use);
    const existing = player.consumes.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }

    player.consumes.set(key, {
      key,
      count: 1,
      spellId: use.spellId,
      itemId: use.itemId ?? (use.candidateItemIds.length === 1 ? use.candidateItemIds[0] : null),
      name: consumableDisplayName(use),
    });
  }

  return [...players.entries()].map(([playerId, data]) => ({
    playerId,
    total: data.total,
    consumes: [...data.consumes.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }));
}
