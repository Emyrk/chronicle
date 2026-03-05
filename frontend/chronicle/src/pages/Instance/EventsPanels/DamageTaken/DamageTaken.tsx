/**
 * Damage Taken panel - React component wrapper for damage taken aggregation
 *
 * Configurable to show damage taken by Players or Enemies.
 */

import { Shield, Skull } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { PanelFilter } from "../processors/filters";
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
  const defaultFilters: PanelFilter[] = targetType === "enemies"
    ? [{ type: "enemies", mode: "include", value: "selected" }]
    : [{ type: "players", mode: "include", value: "selected" }];

  return {
    ...config.processor,
    label: config.label,
    icon: config.icon,
    supportsPerSecond: true,
    defaultFilters,
    render: (props: PanelRenderProps<DamageTakenResult>) => {
      return <DamageTakenContent {...props} targetType={targetType} />;
    },
  };
}
