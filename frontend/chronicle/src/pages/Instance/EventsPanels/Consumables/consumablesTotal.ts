import type { ConsumableUse } from "./consumables.processor";

export interface PossibleConsumeSource {
  consumeId: string;
  spellId: number | null;
  spellName: string;
  kinds: number[];
  bestConfidence: number;
}

export interface ConsumableCount {
  key: string;
  count: number;
  itemId: number | null;
  candidateItemIds: number[];
  sources: PossibleConsumeSource[];
}

export interface PlayerConsumablesTotal {
  playerId: string;
  total: number;
  consumes: ConsumableCount[];
}

/** Case-insensitive fuzzy subsequence match. */
export function fuzzyConsumableMatch(query: string, values: Iterable<string>): boolean {
  const needle = query.toLocaleLowerCase().replace(/\s+/g, "");
  if (!needle) return true;

  for (const value of values) {
    const haystack = value.toLocaleLowerCase().replace(/\s+/g, "");
    let needleIndex = 0;
    for (let i = 0; i < haystack.length && needleIndex < needle.length; i += 1) {
      if (haystack[i] === needle[needleIndex]) needleIndex += 1;
    }
    if (needleIndex === needle.length) return true;
  }
  return false;
}

export function filterConsumablesTotal(
  rows: PlayerConsumablesTotal[],
  query: string,
  itemNames: ReadonlyMap<number, string>,
): PlayerConsumablesTotal[] {
  if (!query.trim()) return rows;

  return rows.flatMap((row) => {
    const consumes = row.consumes.filter((consume) => {
      const itemIds = consume.itemId !== null ? [consume.itemId] : consume.candidateItemIds;
      const searchable = [
        ...itemIds.flatMap((itemId) => [itemNames.get(itemId) ?? "", itemId.toString()]),
        ...consume.sources.flatMap((source) => [source.spellName, source.spellId?.toString() ?? ""]),
      ];
      return fuzzyConsumableMatch(query, searchable);
    });

    return consumes.length > 0
      ? [{ ...row, total: consumes.reduce((total, consume) => total + consume.count, 0), consumes }]
      : [];
  });
}

function itemIdentity(use: ConsumableUse): { key: string; itemId: number | null; candidateItemIds: number[] } {
  if (use.itemId !== null) {
    return { key: `item:${use.itemId}`, itemId: use.itemId, candidateItemIds: [] };
  }

  const candidateItemIds = [...use.candidateItemIds].sort((a, b) => a - b);
  if (candidateItemIds.length === 1) {
    return { key: `item:${candidateItemIds[0]}`, itemId: candidateItemIds[0], candidateItemIds: [] };
  }
  if (candidateItemIds.length > 1) {
    return { key: `candidates:${candidateItemIds.join(",")}`, itemId: null, candidateItemIds };
  }
  return { key: "unknown-item", itemId: null, candidateItemIds: [] };
}

/** Groups physical consume uses by player, then by consumable item identity. */
export function aggregateConsumablesTotal(uses: Iterable<ConsumableUse>): PlayerConsumablesTotal[] {
  const players = new Map<string, { total: number; consumes: Map<string, ConsumableCount> }>();

  for (const use of uses) {
    let player = players.get(use.player);
    if (!player) {
      player = { total: 0, consumes: new Map() };
      players.set(use.player, player);
    }

    player.total += 1;
    const identity = itemIdentity(use);
    const existing = player.consumes.get(identity.key);
    const source: PossibleConsumeSource = {
      consumeId: use.consumeId,
      spellId: use.spellId,
      spellName: use.spellName,
      kinds: [...use.kinds],
      bestConfidence: use.bestConfidence,
    };
    if (existing) {
      existing.count += 1;
      existing.sources.push(source);
      continue;
    }

    player.consumes.set(identity.key, {
      ...identity,
      count: 1,
      sources: [source],
    });
  }

  return [...players.entries()].map(([playerId, data]) => ({
    playerId,
    total: data.total,
    consumes: [...data.consumes.values()].sort((a, b) => {
      const aPossible = a.candidateItemIds.length > 1;
      const bPossible = b.candidateItemIds.length > 1;
      if (aPossible !== bPossible) return aPossible ? 1 : -1;
      return b.count - a.count || a.key.localeCompare(b.key);
    }),
  }));
}
