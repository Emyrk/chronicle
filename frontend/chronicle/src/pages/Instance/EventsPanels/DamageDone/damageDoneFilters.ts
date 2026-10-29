import type { PanelFilter } from "../processors/filters";
import type { DamageSourceType } from "./damageDone.processor";

/** The Damage Done panel's fixed filters for an entity source type. */
export function damageDoneFixedFilters(sourceType: DamageSourceType): PanelFilter[] {
  const dmg = ["damage"] as string[];
  switch (sourceType) {
    case "enemies":
      return [
        { type: "source_type" as const, value: ["enemy", "enemy_pet"], applyTo: dmg },
      ];
    case "pets":
      return [
        { type: "source_type" as const, value: "pet", applyTo: dmg },
        { type: "target_type" as const, value: ["player", "pet"], negate: true, applyTo: dmg },
      ];
    case "friendly_fire":
      return [
        { type: "source_type" as const, value: ["player", "pet"], applyTo: dmg },
        { type: "target_type" as const, value: ["player", "pet"], applyTo: dmg },
      ];
    case "players":
    default:
      return [
        { type: "source_type" as const, value: ["player", "pet"], applyTo: dmg },
        { type: "target_type" as const, value: ["player", "pet"], negate: true, applyTo: dmg },
      ];
  }
}

// Default target filters — pre-populated in the filter editor, removable by the user.
// Matches the hardcoded entity selection logic in the processor (which gates breakouts).
export function damageDoneDefaultFilters(sourceType: DamageSourceType): PanelFilter[] {
  const dmg = ["damage"] as string[];
  switch (sourceType) {
    case "enemies":
      return [{ type: "target_type" as const, value: "selected_players", applyTo: dmg }];
    case "players":
    case "pets":
      return [{ type: "target_type" as const, value: "selected_enemies", applyTo: dmg }];
    case "friendly_fire":
      return [{ type: "target_type" as const, value: "selected_players", applyTo: dmg }];
  }
}
