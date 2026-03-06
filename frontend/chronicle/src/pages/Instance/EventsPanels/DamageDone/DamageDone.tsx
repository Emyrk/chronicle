/**
 * Damage Done panel - React component wrapper for damage aggregation
 *
 * Configurable to show damage from Players, Enemies, or Pets.
 */

import { Swords, Skull, PawPrint, Flame } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { PanelFilter } from "../processors/filters";
import {
  damageDoneProcessor,
  enemyDamageDoneProcessor,
  petDamageDoneProcessor,
  friendlyFireProcessor,
  type DamageDoneState,
} from "../processors";
import { DamageDoneContent } from "./DamageDoneContent";
import type { DamageSourceType } from "./damageDone.processor";

// Re-export for convenience
export type { DamageSourceType } from "./damageDone.processor";

interface DamageSourceConfig {
  label: string;
  icon: React.ReactNode;
  processor: typeof damageDoneProcessor;
}

const DAMAGE_SOURCE_CONFIGS: Record<DamageSourceType, DamageSourceConfig> = {
  players: {
    label: "Damage Done",
    icon: <Swords className="h-4 w-4" />,
    processor: damageDoneProcessor,
  },
  enemies: {
    label: "Enemy Damage",
    icon: <Skull className="h-4 w-4" />,
    processor: enemyDamageDoneProcessor,
  },
  pets: {
    label: "Pet Damage",
    icon: <PawPrint className="h-4 w-4" />,
    processor: petDamageDoneProcessor,
  },
  friendly_fire: {
    label: "Friendly Fire",
    icon: <Flame className="h-4 w-4" />,
    processor: friendlyFireProcessor,
  },
};

/**
 * Create a DamageDonePanel configured for a specific entity source type.
 */
export function createDamageDonePanel(
  sourceType: DamageSourceType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): PanelDefinition<DamageDoneState, any> {
  const config = DAMAGE_SOURCE_CONFIGS[sourceType];
  const fixedFilters: PanelFilter[] = (() => {
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
  })();

  return {
    ...config.processor,
    label: config.label,
    icon: config.icon,
    supportsPerSecond: true,
    supportsFiltering: true,
    fixedFilters,
    render: (props: PanelRenderProps<DamageDoneState>) => {
      return <DamageDoneContent {...props} sourceType={sourceType} />;
    },
  };
}
