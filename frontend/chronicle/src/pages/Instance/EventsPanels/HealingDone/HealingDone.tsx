/**
 * Healing Done panel - React component wrapper for healing aggregation
 */

import { Heart } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { PanelFilter } from "../processors/filters";
import { MERGED_GROUPING_OPTIONS, PET_GROUPING_OPTIONS } from "../processors/resolveEntity";
import { unifiedHealingProcessor, type UnifiedHealingResult } from "../processors";
import { HealingDoneContent } from "./HealingDoneContent";

/**
 * Entity source types for healing aggregation
 */
export type HealingSourceType = "players";

interface HealingSourceConfig {
  label: string;
  icon: React.ReactNode;
}

const HEALING_SOURCE_CONFIGS: Record<HealingSourceType, HealingSourceConfig> = {
  players: {
    label: "Healing Done",
    icon: <Heart className="h-4 w-4" />,
  },
};

/**
 * Create a HealingDonePanel configured for a specific entity source type.
 */
export function createHealingDonePanel(
  sourceType: HealingSourceType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): PanelDefinition<UnifiedHealingResult, any> {
  const config = HEALING_SOURCE_CONFIGS[sourceType];
  const heal = ["heal"] as string[];

  // Fixed: only healing from player casters (matches processor's isCasterPlayer check)
  const fixedFilters: PanelFilter[] = [
    { type: "source_type" as const, value: ["player", "pet"], applyTo: heal },
    
  ];

  // Default: narrow to healing targeted at selected players
  const defaultFilters: PanelFilter[] = [
    { type: "time_range" as const, value: "controller", applyTo:heal},
    { type: "target_type" as const, value: "selected_players", applyTo: heal },
  ];

  return {
    ...unifiedHealingProcessor,
    id: "healing_done", // Override processor id to match registry key
    label: config.label,
    icon: config.icon,
    supportsPerSecond: true,
    supportsFiltering: true,
    fixedFilters,
    defaultFilters,
    groupingOptions: MERGED_GROUPING_OPTIONS,
    petOptions: PET_GROUPING_OPTIONS,
    
    render: (props: PanelRenderProps<UnifiedHealingResult>) => {
      return <HealingDoneContent {...props} sourceType={sourceType} />;
    },
  };
}
