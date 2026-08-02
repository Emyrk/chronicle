import type { ConsumableDisambiguation } from "@/api/typesGenerated";
import type { ConsumableUse } from "./consumables.processor";

export function consumableDisambiguationKey(kind: string, spellId: number): string {
  return `${kind}:${spellId}`;
}

export function buildConsumableDisambiguationMap(rows: readonly ConsumableDisambiguation[] | undefined): Map<string, number> {
  return new Map((rows ?? []).map((row) => [consumableDisambiguationKey(row.effect_kind, row.spell_id), row.item_id]));
}

export function resolveConsumableUse(use: ConsumableUse, mappings: ReadonlyMap<string, number>): ConsumableUse {
  if (use.itemId !== null || use.candidateEffectKind === null || use.candidateSpellId === null) return use;
  const itemId = mappings.get(consumableDisambiguationKey(use.candidateEffectKind, use.candidateSpellId));
  if (itemId === undefined || !use.candidateItemIds.includes(itemId)) return use;
  return { ...use, itemId };
}
