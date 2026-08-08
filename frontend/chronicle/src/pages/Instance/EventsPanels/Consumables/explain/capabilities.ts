import type { Instance } from "../../../InstancePage";
import type { ConsumablesResult } from "../consumables.processor";

export interface ConsumablesCapabilities {
  hasUses: boolean;
  hasMultiplePlayers: boolean;
  hasMultipleItems: boolean;
  hasMultipleEncounters: boolean;
  hasAmbiguousUses: boolean;
}

export function deriveCapabilities(
  result: ConsumablesResult | null,
  _durationMs: number,
  instance: Instance | null,
): ConsumablesCapabilities {
  const uses = [...(result?.uses.values() ?? [])];
  const itemKeys = new Set(
    uses.map((use) =>
      use.itemId !== null
        ? `item:${use.itemId}`
        : `possible:${use.candidateItemIds.join(",")}:${use.spellId ?? "unknown"}`,
    ),
  );

  return {
    hasUses: uses.length > 0,
    hasMultiplePlayers: new Set(uses.map((use) => use.player)).size > 1,
    hasMultipleItems: itemKeys.size > 1,
    hasMultipleEncounters:
      new Set(uses.map((use) => use.encounterID)).size > 1 ||
      (instance?.encounters.length ?? 0) > 1,
    hasAmbiguousUses: uses.some(
      (use) => use.itemId === null && use.candidateItemIds.length !== 1,
    ),
  };
}
