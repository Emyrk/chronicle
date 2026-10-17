/**
 * Damage Taken panel - React component wrapper for damage taken aggregation
 *
 * Configurable to show damage taken by Players or Enemies.
 */

import { Shield, Skull } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { PanelFilter } from "../processors/filters";
import type { GroupingOption } from "../processors/resolveEntity";
import {
  damageTakenProcessor,
  enemyDamageTakenProcessor,
  type DamageTakenResult,
} from "./damageTaken.processor";
import { DamageTakenContent } from "./DamageTakenContent";
import type { DamageTargetType } from "./damageTaken.processor";

// Re-export for convenience
export type { DamageTargetType } from "./damageTaken.processor";

interface DamageTargetConfig {
  label: string;
  icon: React.ReactNode;
  processor: typeof damageTakenProcessor;
}

const DAMAGE_TARGET_CONFIGS: Record<DamageTargetType, DamageTargetConfig> = {
  players: {
    label: "Damage Taken",
    icon: <Shield className="h-4 w-4" />,
    processor: damageTakenProcessor,
  },
  enemies: {
    label: "Enemy Damage Taken",
    icon: <Skull className="h-4 w-4" />,
    processor: enemyDamageTakenProcessor,
  },
};

/**
 * Create a DamageTakenPanel configured for a specific entity target type.
 */
export function createDamageTakenPanel(
  targetType: DamageTargetType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): PanelDefinition<DamageTakenResult, any> {
  const config = DAMAGE_TARGET_CONFIGS[targetType];
  const dmg = ["damage"] as string[];

  // Fixed filters: gate which entity type is the *receiver* of damage.
  const fixedFilters: PanelFilter[] = targetType === "enemies"
    ? [
        { type: "target_type" as const, value: ["enemy", "enemy_pet"], applyTo: dmg },
      ]
    : [
        { type: "target_type" as const, value: ["player", "pet"], applyTo: dmg },
      ];

  // Default source filters — pre-populated, removable by user.
  const defaultFilters: PanelFilter[] = targetType === "enemies"
    ? [
      { type: "source_type" as const, value: "selected_players", applyTo: dmg },
    ]
    : [
      { type: "source_type" as const, value: "selected_enemies", applyTo: dmg },
    ];

  const groupingOptions: GroupingOption[] = [
    { value: "default", label: "By Unit" },
    { value: "name", label: "By Name" },
  ];

  const petOptions: GroupingOption[] = [
    { value: "individual", label: "By Pet" },
    { value: "owner", label: "By Owner" },
    { value: "name", label: "By Pet Name" },
  ];

  return {
    ...config.processor,
    label: config.label,
    icon: config.icon,
    keybinds: [{ keys: "Esc", action: "Return from a focused player to the player list" }],
    supportsPerSecond: true,
    supportsFiltering: true,
    fixedFilters,
    groupingOptions,
    petOptions,
    defaultFilters: [{ type: "time_range" as const, value: "controller", applyTo:["damage"]}, ...defaultFilters],
    render: (props: PanelRenderProps<DamageTakenResult>) => {
      return <DamageTakenContent {...props} targetType={targetType} />;
    },
  };
}
