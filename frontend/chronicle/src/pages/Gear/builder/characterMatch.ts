/**
 * Pure matching of a gear list against a character's armory gear history.
 * No React imports.
 */
import type {
  ArmoryGearHistoryResponse,
  PlayerOutfit,
} from "@/api/typesGenerated";
import {
  COSMETIC_SLOTS,
  type GearPayload,
  type GearStage,
} from "./gearListModel";

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
      ...(item.enchant_id && item.enchant_id > 0
        ? { enchant_id: item.enchant_id }
        : {}),
    };
  });
  return { equippedIds, equippedSlots };
}

/** Convert a matched Armory outfit into the builder's read-only stage shape. */
export function characterMatchStage(match: CharacterMatch): GearStage {
  const slots: GearStage["slots"] = {};
  match.equippedSlots.forEach((equipped, slotIndex) => {
    if (!equipped) return;
    slots[String(slotIndex)] = {
      item_id: equipped.item_id,
      ...(equipped.enchant_id ? { enchant_id: equipped.enchant_id } : {}),
    };
  });
  return { name: "Current Armory gear", slots };
}

/**
 * Attribute each equipped Armory item to the first progression stage that
 * accepts it in the same slot, either as the primary pick or an alternate.
 */
export function equippedItemStageMatches(
  stages: readonly GearStage[],
  match: CharacterMatch,
): Map<number, string> {
  const matches = new Map<number, string>();

  match.equippedSlots.forEach((equipped, slotIndex) => {
    if (!equipped) return;
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stage = stages[stageIndex];
      const entry = stage?.slots[String(slotIndex)];
      if (!entry) continue;
      const accepted =
        entry.item_id === equipped.item_id ||
        (entry.alternates ?? []).some(
          (alternate) => alternate.item_id === equipped.item_id,
        );
      if (!accepted) continue;
      matches.set(slotIndex, stage.name || `Stage ${stageIndex + 1}`);
      break;
    }
  });

  return matches;
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

export function stageCoverage(
  stage: GearStage,
  match: CharacterMatch,
): StageCoverage {
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

export interface ProgressionStageCoverage {
  /** Non-cosmetic target slots in this effective stage. */
  total: number;
  /** Target slots matched by this stage's own accepted item choices. */
  fromStage: number;
  /** Target slots already satisfied by an accepted item in a later stage. */
  fromLaterStages: ReadonlyArray<{ stageIndex: number; count: number }>;
  /** Total target slots satisfied by this or a later stage. */
  covered: number;
  /** Target slots not satisfied by this or a later stage. */
  open: number;
}

/**
 * Measure a character's forward progress through ordered effective stages.
 * A later accepted upgrade also clears the same slot in every earlier stage,
 * and is attributed to the first later stage that accepts it.
 */
export function progressionStageCoverage(
  stages: readonly GearStage[],
  match: CharacterMatch,
): ProgressionStageCoverage[] {
  return stages.map((stage, stageIndex) => {
    let total = 0;
    let fromStage = 0;
    const laterCounts = new Map<number, number>();

    for (const [key, entry] of Object.entries(stage.slots)) {
      if (!entry) continue;
      const slotIndex = Number(key);
      if (COSMETIC_SLOTS.has(slotIndex)) continue;
      total++;

      if (slotEquipped(stage, slotIndex, match)) {
        fromStage++;
        continue;
      }

      for (
        let laterIndex = stageIndex + 1;
        laterIndex < stages.length;
        laterIndex++
      ) {
        const laterStage = stages[laterIndex];
        if (!laterStage || !slotEquipped(laterStage, slotIndex, match))
          continue;
        laterCounts.set(laterIndex, (laterCounts.get(laterIndex) ?? 0) + 1);
        break;
      }
    }

    const fromLaterStages = [...laterCounts].map(
      ([laterStageIndex, count]) => ({
        stageIndex: laterStageIndex,
        count,
      }),
    );
    const covered =
      fromStage + fromLaterStages.reduce((sum, later) => sum + later.count, 0);

    return {
      total,
      fromStage,
      fromLaterStages,
      covered,
      open: total - covered,
    };
  });
}

/** Coverage for every stage of the document. */
export function payloadCoverage(
  payload: GearPayload,
  match: CharacterMatch,
): StageCoverage[] {
  return payload.stages.map((stage) => stageCoverage(stage, match));
}
