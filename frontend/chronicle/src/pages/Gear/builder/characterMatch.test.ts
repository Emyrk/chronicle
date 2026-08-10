import { describe, expect, it } from "vitest";
import type {
  ArmoryGearHistoryResponse,
  PlayerOutfit,
} from "@/api/typesGenerated";
import {
  buildCharacterMatch,
  progressionStageCoverage,
  slotEquipped,
  stageCoverage,
} from "./characterMatch";
import { GEAR_PAYLOAD_VERSION, SLOT, type GearStage } from "./gearListModel";

function outfit(ids: Partial<Record<number, number>>): PlayerOutfit {
  return Array.from({ length: 19 }, (_, i) => ({
    item_id: ids[i] ?? 0,
  })) as unknown as PlayerOutfit;
}

function history(...snapshots: PlayerOutfit[]): ArmoryGearHistoryResponse {
  // Newest first, matching the armory endpoint.
  return {
    snapshots: snapshots.map((gear, i) => ({
      instance_id: `i${i}`,
      instance_name: `Raid ${i}`,
      equipped_at: new Date(2026, 0, 10 - i).toISOString(),
      gear,
    })),
  } as unknown as ArmoryGearHistoryResponse;
}

describe("buildCharacterMatch", () => {
  it("uses the newest snapshot when no current outfit is given", () => {
    const match = buildCharacterMatch(
      history(outfit({ 0: 100, 4: 200 }), outfit({ 0: 101, 4: 200, 15: 300 })),
    );
    expect([...match.equippedIds].sort()).toEqual([100, 200]);
  });

  it("handles empty history", () => {
    const match = buildCharacterMatch({
      snapshots: [],
    } as unknown as ArmoryGearHistoryResponse);
    expect(match.equippedIds.size).toBe(0);
    expect(match.equippedSlots.some(Boolean)).toBe(false);
  });

  it("prefers the current outfit over snapshots", () => {
    const match = buildCharacterMatch(
      history(outfit({ 0: 100 })),
      outfit({ 0: 111, 4: 222 }),
    );
    expect([...match.equippedIds].sort()).toEqual([111, 222]);
    expect(match.equippedSlots[0]).toEqual({ item_id: 111 });
    expect(match.equippedSlots[4]).toEqual({ item_id: 222 });
  });

  it("builds equipped from the current outfit even with no history", () => {
    const match = buildCharacterMatch(
      { snapshots: [] } as unknown as ArmoryGearHistoryResponse,
      outfit({ 15: 300 }),
    );
    expect(match.equippedSlots[15]).toEqual({ item_id: 300 });
    expect(match.equippedIds.has(300)).toBe(true);
  });
});

describe("slotEquipped / stageCoverage", () => {
  const stage: GearStage = {
    name: "Pre-Raid",
    slots: {
      [String(SLOT.head)]: { item_id: 100 },
      [String(SLOT.chest)]: { item_id: 999, alternates: [{ item_id: 101 }] },
      [String(SLOT.mainHand)]: { item_id: 555 },
      [String(SLOT.shirt)]: { item_id: 42 }, // cosmetic, excluded from coverage
    },
  };
  const match = buildCharacterMatch(history(outfit({ 0: 100, 4: 101 })));

  it("counts primary and alternate wear", () => {
    expect(slotEquipped(stage, SLOT.head, match)).toBe(true); // primary worn
    expect(slotEquipped(stage, SLOT.chest, match)).toBe(true); // via alternate
    expect(slotEquipped(stage, SLOT.mainHand, match)).toBe(false);
    expect(slotEquipped(stage, SLOT.waist, match)).toBe(false); // empty slot
  });

  it("recognizes every currently equipped item ID, including alternates", () => {
    const wornIds = [100, 101];
    expect(wornIds.every((itemId) => match.equippedIds.has(itemId))).toBe(true);
    expect(slotEquipped(stage, SLOT.head, match)).toBe(true);
    expect(slotEquipped(stage, SLOT.chest, match)).toBe(true);
  });

  it("computes coverage excluding cosmetic slots", () => {
    const coverage = stageCoverage(stage, match);
    expect(coverage).toEqual({
      filled: 3,
      equipped: 2,
      missing: [SLOT.mainHand],
    });
  });

  it("credits later-stage upgrades toward earlier stage targets", () => {
    const stages: GearStage[] = [
      {
        name: "Pre-Raid",
        slots: {
          [String(SLOT.head)]: { item_id: 100 },
          [String(SLOT.chest)]: { item_id: 200 },
          [String(SLOT.hands)]: { item_id: 300 },
        },
      },
      {
        name: "Molten Core",
        slots: {
          [String(SLOT.head)]: { item_id: 110 },
          [String(SLOT.chest)]: { item_id: 200 },
          [String(SLOT.hands)]: { item_id: 310 },
        },
      },
      {
        name: "BWL",
        slots: {
          [String(SLOT.head)]: { item_id: 120 },
          [String(SLOT.chest)]: { item_id: 220 },
          [String(SLOT.hands)]: { item_id: 310 },
        },
      },
    ];
    const progressionMatch = buildCharacterMatch(
      history(
        outfit({
          [SLOT.head]: 120,
          [SLOT.chest]: 200,
        }),
      ),
    );

    expect(progressionStageCoverage(stages, progressionMatch)).toEqual([
      {
        total: 3,
        fromStage: 1,
        fromLaterStages: [{ stageIndex: 2, count: 1 }],
        covered: 2,
        open: 1,
      },
      {
        total: 3,
        fromStage: 1,
        fromLaterStages: [{ stageIndex: 2, count: 1 }],
        covered: 2,
        open: 1,
      },
      {
        total: 3,
        fromStage: 1,
        fromLaterStages: [],
        covered: 1,
        open: 2,
      },
    ]);
  });

  it("payload version constant sanity", () => {
    expect(GEAR_PAYLOAD_VERSION).toBe(2);
  });
});
