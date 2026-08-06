import type { EquipmentResult } from "../equipment.processor";

export interface EquipmentCapabilities {
  hasPlayers: boolean;
  hasMultiplePlayers: boolean;
  hasGear: boolean;
  hasEnchants: boolean;
  hasTalents: boolean;
}

export function deriveCapabilities(result: EquipmentResult | null): EquipmentCapabilities {
  const players = result ? Array.from(result.players.values()) : [];
  return {
    hasPlayers: players.length > 0,
    hasMultiplePlayers: players.length > 1,
    hasGear: players.some((player) => player.gear.some((item) => item.itemId > 0)),
    hasEnchants: players.some((player) => player.gear.some((item) => item.enchantId != null && item.enchantId > 0)),
    hasTalents: players.some((player) => player.talents != null),
  };
}
