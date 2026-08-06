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
  /** Items the character is currently wearing. */
  equippedIds: ReadonlySet<number>;
  /**
   * The current outfit by slot index (0-18); undefined for empty slots.
   * Used to fill a stage from the character's gear.
   */
  equippedSlots: ReadonlyArray<EquippedSlot | undefined>;
}

export interface StageCoverage {
  /** Non-cosmetic slots with a primary pick. */
  filled: number;
  /** Filled slots whose primary (or any alternate) is currently worn. */
  equipped: number;
  /** Outfit indexes of filled slots the character is not wearing. */
  missing: number[];
}

/**
 * The character's current outfit, falling back to the newest history
 * snapshot when the armory player is unavailable (history rows are newer
 * infrastructure and can be missing entirely).
 */
export function buildCharacterMatch(
  history: ArmoryGearHistoryResponse,
  currentGear?: PlayerOutfit,
): CharacterMatch {
  const equippedIds = new Set<number>();
  const equippedSlots: (EquippedSlot | undefined)[] = [];

  const gear = currentGear ?? history.snapshots[0]?.gear;
  gear?.forEach((item, slotIndex) => {
    if (!item || item.item_id <= 0) return;
    equippedIds.add(item.item_id);
    equippedSlots[slotIndex] = {
      item_id: item.item_id,
      ...(item.enchant_id && item.enchant_id > 0 ? { enchant_id: item.enchant_id } : {}),
    };
  });
  return { equippedIds, equippedSlots };
}

/** True when the character is wearing the slot's primary pick or any alternate. */
export function slotEquipped(
  stage: GearStage,
  slotIndex: number,
  match: CharacterMatch,
): boolean {
  const entry = stage.slots[String(slotIndex)];
  if (!entry) return false;
  if (match.equippedIds.has(entry.item_id)) return true;
  return (entry.alternates ?? []).some((a) => match.equippedIds.has(a.item_id));
}

export function stageCoverage(stage: GearStage, match: CharacterMatch): StageCoverage {
  const coverage: StageCoverage = { filled: 0, equipped: 0, missing: [] };
  for (const [key, entry] of Object.entries(stage.slots)) {
    if (!entry) continue;
    const slotIndex = Number(key);
    if (COSMETIC_SLOTS.has(slotIndex)) continue;
    coverage.filled++;
    if (slotEquipped(stage, slotIndex, match)) {
      coverage.equipped++;
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
