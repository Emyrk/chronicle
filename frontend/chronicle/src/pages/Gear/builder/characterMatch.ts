/**
 * Pure matching of a gear list against a character's armory gear history.
 * No React imports.
 */
import type { ArmoryGearHistoryResponse } from "@/api/typesGenerated";
import { COSMETIC_SLOTS, type GearPayload, type GearStage } from "./gearListModel";

export interface CharacterMatch {
  /** Items in the newest snapshot (currently worn). */
  equippedIds: ReadonlySet<number>;
  /** Items seen in any snapshot (owned at some point). */
  ownedIds: ReadonlySet<number>;
}

export interface StageCoverage {
  /** Non-cosmetic slots with a primary pick. */
  filled: number;
  /** Filled slots whose primary (or any alternate) the character owns. */
  owned: number;
  /** Filled slots whose primary item is currently equipped. */
  equipped: number;
  /** Outfit indexes of filled slots the character does not own. */
  missing: number[];
}

/**
 * Snapshots arrive newest-first from the armory endpoint; equipped =
 * the newest snapshot's items, owned = the union across snapshots.
 */
export function buildCharacterMatch(history: ArmoryGearHistoryResponse): CharacterMatch {
  const equippedIds = new Set<number>();
  const ownedIds = new Set<number>();
  history.snapshots.forEach((snapshot, i) => {
    for (const item of snapshot.gear) {
      if (!item || item.item_id <= 0) continue;
      ownedIds.add(item.item_id);
      if (i === 0) equippedIds.add(item.item_id);
    }
  });
  return { equippedIds, ownedIds };
}

/** True when the character owns the slot's primary pick or any alternate. */
export function slotOwned(
  stage: GearStage,
  slotIndex: number,
  match: CharacterMatch,
): boolean {
  const entry = stage.slots[String(slotIndex)];
  if (!entry) return false;
  if (match.ownedIds.has(entry.item_id)) return true;
  return (entry.alternates ?? []).some((a) => match.ownedIds.has(a.item_id));
}

export function stageCoverage(stage: GearStage, match: CharacterMatch): StageCoverage {
  const coverage: StageCoverage = { filled: 0, owned: 0, equipped: 0, missing: [] };
  for (const [key, entry] of Object.entries(stage.slots)) {
    if (!entry) continue;
    const slotIndex = Number(key);
    if (COSMETIC_SLOTS.has(slotIndex)) continue;
    coverage.filled++;
    if (match.equippedIds.has(entry.item_id)) coverage.equipped++;
    if (slotOwned(stage, slotIndex, match)) {
      coverage.owned++;
    } else {
      coverage.missing.push(slotIndex);
    }
  }
  coverage.missing.sort((a, b) => a - b);
  return coverage;
}

/** Coverage for every stage of the document. */
export function payloadCoverage(payload: GearPayload, match: CharacterMatch): StageCoverage[] {
  return payload.stages.map((stage) => stageCoverage(stage, match));
}
