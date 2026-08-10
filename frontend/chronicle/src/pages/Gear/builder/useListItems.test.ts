import { describe, expect, it } from "vitest";
import type { ItemTooltip } from "@/api/typesGenerated";
import type { GearStage } from "./gearListModel";
import {
  itemRefKey,
  stageUsesTwoHandedWeapon,
  stageWithValidWeaponSlots,
  type HydratedItem,
} from "./useListItems";

function hydrated(itemId: number, inventoryType: number): HydratedItem {
  return {
    itemId,
    name: `Item ${itemId}`,
    icon: "",
    quality: 1,
    itemLevel: 1,
    tooltip: { inventory_type: inventoryType } as ItemTooltip,
    isLoading: false,
  };
}

const stage: GearStage = {
  name: "Stage",
  slots: {
    "15": { item_id: 1 },
    "16": { item_id: 2 },
  },
};

describe("two-handed weapon slots", () => {
  it("removes the off hand when the main hand is two-handed", () => {
    const items = new Map([
      [itemRefKey(1), hydrated(1, 17)],
      [itemRefKey(2), hydrated(2, 14)],
    ]);

    expect(stageUsesTwoHandedWeapon(stage, items)).toBe(true);
    expect(stageWithValidWeaponSlots(stage, items).slots["16"]).toBeUndefined();
    expect(stage.slots["16"]).toEqual({ item_id: 2 });
  });

  it("keeps the off hand with a one-handed main hand", () => {
    const items = new Map([
      [itemRefKey(1), hydrated(1, 13)],
      [itemRefKey(2), hydrated(2, 14)],
    ]);

    expect(stageUsesTwoHandedWeapon(stage, items)).toBe(false);
    expect(stageWithValidWeaponSlots(stage, items)).toBe(stage);
  });
});
