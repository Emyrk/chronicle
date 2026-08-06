/**
 * Pure matching of a gear list against a character's armory gear history.
 * No React imports.
 */
import type { ArmoryGearHistoryResponse, PlayerOutfit } from "@/api/typesGenerated";
import { COSMETIC_SLOTS, type GearPayload, type GearStage } from "./gearListModel";

export interface EquippedSlot {
  item_id: number;
  enchant_id?: number;
}

export interface CharacterMatch {
  /** Items in the newest snapshot (currently worn). */
  equippedIds: ReadonlySet<number>;
  /** Items seen in any snapshot (owned at some point). */
  ownedIds: ReadonlySet<number>;
  /**
   * The newest snapshot's outfit by slot index (0-18); undefined for
   * empty slots. Used to fill a stage from the character's gear.
   */
  equippedSlots: ReadonlyArray<EquippedSlot | undefined>;
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
 * Equipped = the character's current outfit (falling back to the newest
 * history snapshot when the armory player is unavailable — history rows
 * are newer infrastructure and can be missing entirely). Owned = the
 * union of the current outfit and every snapshot.
 */
export function buildCharacterMatch(
  history: ArmoryGearHistoryResponse,
  currentGear?: PlayerOutfit,
): CharacterMatch {
  const equippedIds = new Set<number>();
  const ownedIds = new Set<number>();
  const equippedSlots: (EquippedSlot | undefined)[] = [];

  const recordEquipped = (gear: PlayerOutfit) => {
    gear.forEach((item, slotIndex) => {
      if (!item || item.item_id <= 0) return;
      ownedIds.add(item.item_id);
      equippedIds.add(item.item_id);
      equippedSlots[slotIndex] = {
        item_id: item.item_id,
        ...(item.enchant_id && item.enchant_id > 0 ? { enchant_id: item.enchant_id } : {}),
      };
    });
  };

  if (currentGear) {
    recordEquipped(currentGear);
  } else if (history.snapshots.length > 0) {
    recordEquipped(history.snapshots[0].gear);
  }

  for (const snapshot of history.snapshots) {
    for (const item of snapshot.gear) {
      if (item && item.item_id > 0) ownedIds.add(item.item_id);
    }
  }
  return { equippedIds, ownedIds, equippedSlots };
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
