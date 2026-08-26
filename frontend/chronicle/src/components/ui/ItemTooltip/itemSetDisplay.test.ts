import { describe, expect, it } from "vitest";
import type { ItemSetInfo, ItemSetPiece } from "@/api/typesGenerated";
import {
  equippedItemSetSlotCount,
  isItemSetSlotEquipped,
  itemSetDisplayPieces,
} from "./itemSetDisplay";

const piece = (
  entry: number,
  inventory_type: number,
  name = `Item ${entry}`,
): ItemSetPiece => ({ entry, inventory_type, name });

const set = (items: ItemSetPiece[]): ItemSetInfo => ({
  id: 1,
  name: "Tier Set",
  item_ids: [],
  items,
  eligible_items: items,
  bonuses: [],
});

describe("itemSetDisplayPieces", () => {
  it("compacts cross-tier variants to one piece per equipment slot", () => {
    const items = [
      piece(100, 1), piece(101, 3), piece(102, 5), piece(103, 10), piece(104, 7),
      piece(200, 1), piece(201, 3), piece(202, 20), piece(203, 10), piece(204, 7),
      piece(300, 1), piece(301, 3), piece(302, 5), piece(303, 10), piece(304, 7),
    ];

    expect(itemSetDisplayPieces(set(items), 203).map((item) => item.entry)).toEqual([
      200, 201, 202, 203, 204,
    ]);
  });

  it("counts equipped cross-tier variants once per equipment slot", () => {
    const eligible = [piece(100, 1), piece(200, 1), piece(101, 3), piece(201, 3)];
    const equipped = new Set([100, 200, 201]);

    expect(equippedItemSetSlotCount(eligible, equipped)).toBe(2);
    expect(isItemSetSlotEquipped(piece(101, 3), eligible, equipped)).toBe(true);
  });
});
