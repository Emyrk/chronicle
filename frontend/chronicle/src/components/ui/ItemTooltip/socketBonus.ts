import type { ItemSocket, ItemTooltip } from "@/api/typesGenerated";

const ITEM_CLASS_GEM = 3;

// Gem item subclasses map to the socket color bitmask used by ItemSocket.
// Red=2, Yellow=4, Blue=8, and hybrid gems combine those bits.
const GEM_SOCKET_COLORS: Readonly<Record<number, number>> = {
  0: 2, // Red
  1: 8, // Blue
  2: 4, // Yellow
  3: 2 | 8, // Purple
  4: 4 | 8, // Green
  5: 2 | 4, // Orange
  6: 1, // Meta
  8: 2 | 4 | 8, // Prismatic
};

type GemTooltip = Pick<ItemTooltip, "item_class" | "item_subclass">;

export function isSocketBonusFulfilled(
  sockets: readonly ItemSocket[] | undefined,
  gemEnchantIds: readonly number[],
  gems: readonly (GemTooltip | undefined)[],
): boolean {
  if (!sockets?.length) return false;

  return sockets.every((socket, index) => {
    if ((gemEnchantIds[index] ?? 0) <= 0) return false;

    const gem = gems[index];
    if (!gem || gem.item_class !== ITEM_CLASS_GEM) return false;

    const gemColor = GEM_SOCKET_COLORS[gem.item_subclass] ?? 0;
    return (gemColor & socket.color) !== 0;
  });
}
