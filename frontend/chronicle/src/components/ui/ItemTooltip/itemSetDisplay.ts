import type { ItemSetInfo, ItemSetPiece } from "@/api/typesGenerated";

function slotKey(piece: ItemSetPiece): number {
  // Robes and chest armor occupy the same equipment slot.
  return piece.inventory_type === 20 ? 5 : piece.inventory_type;
}

/**
 * Compact cross-tier item sets to one representative piece per equipment
 * slot. Prefer the hovered item's tier by choosing nearby item IDs, which are
 * allocated together for tier variants in the game data.
 */
export function itemSetDisplayPieces(
  set: ItemSetInfo,
  currentItemId: number,
): ItemSetPiece[] {
  const pieces = set.items ?? [];
  const bySlot = new Map<number, ItemSetPiece[]>();
  for (const piece of pieces) {
    const key = slotKey(piece);
    const group = bySlot.get(key) ?? [];
    group.push(piece);
    bySlot.set(key, group);
  }

  return [...bySlot.values()].map((group) =>
    group.reduce((best, candidate) =>
      Math.abs(candidate.entry - currentItemId) <
      Math.abs(best.entry - currentItemId)
        ? candidate
        : best,
    ),
  );
}

export function equippedItemSetSlotCount(
  eligibleItems: readonly ItemSetPiece[],
  equippedItemIds: ReadonlySet<number> | undefined,
): number {
  if (!equippedItemIds) return 0;
  return new Set(
    eligibleItems
      .filter((piece) => equippedItemIds.has(piece.entry))
      .map(slotKey),
  ).size;
}

export function isItemSetSlotEquipped(
  piece: ItemSetPiece,
  eligibleItems: readonly ItemSetPiece[],
  equippedItemIds: ReadonlySet<number> | undefined,
): boolean {
  if (!equippedItemIds) return false;
  const key = slotKey(piece);
  return eligibleItems.some(
    (eligible) =>
      slotKey(eligible) === key && equippedItemIds.has(eligible.entry),
  );
}
