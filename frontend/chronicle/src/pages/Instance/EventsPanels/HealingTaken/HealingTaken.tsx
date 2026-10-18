/**
 * Healing Taken panel - React component wrapper for healing received aggregation
 */

import { HeartPulse } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { PanelFilter } from "../processors/filters";
import { unifiedHealingProcessor, type UnifiedHealingResult } from "../processors";
import { HealingTakenContent } from "./HealingTakenContent";
import type { GroupingOption } from "../processors/resolveEntity";

/**
 * Entity target types for healing taken aggregation
 */
export type HealingTargetType = "players";

interface HealingTargetConfig {
  label: string;
  icon: React.ReactNode;
}

const HEALING_TARGET_CONFIGS: Record<HealingTargetType, HealingTargetConfig> = {
  players: {
    label: "Healing Taken",
    icon: <HeartPulse className="h-4 w-4" />,
  },
};

/**
 * Create a HealingTakenPanel configured for a specific entity target type.
 */
export function createHealingTakenPanel(
  targetType: HealingTargetType
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): PanelDefinition<UnifiedHealingResult, any> {
  const config = HEALING_TARGET_CONFIGS[targetType];
  const heal = ["heal", "absorbed"] as string[];

  // Fixed: only healing received by players/pets
  const fixedFilters: PanelFilter[] = [
    { type: "target_type" as const, value: ["player", "pet"], applyTo: heal },
  ];

  // Default: narrow to healing from selected healers
  const defaultFilters: PanelFilter[] = [
     { type: "time_range" as const, value: "controller", applyTo:heal},
    { type: "source_type" as const, value: "selected_players", applyTo: heal },
  ];

  return {
    ...unifiedHealingProcessor,
    id: "healing_taken", // Override processor id to match registry key
    label: config.label,
    icon: config.icon,
    keybinds: [{ keys: "Esc", action: "Return from a focused player to the player list" }],
    renderOnlyOptionTokens: ["f:", "noranks", "effective", "overheal", "total"],
    supportsPerSecond: true,
    supportsFiltering: true,
    groupingOptions: [
      { value: "default", label: "By Unit" },
      { value: "merged", label: "By Unit (Merged)" },
      { value: "name", label: "By Name" },
    ] satisfies GroupingOption[],
    petOptions: [
      { value: "individual", label: "By Pet" },
      { value: "owner", label: "By Owner" },
      { value: "name", label: "By Pet Name" },
    ] satisfies GroupingOption[],
    fixedFilters,
    defaultFilters,
    
    render: (props: PanelRenderProps<UnifiedHealingResult>) => {
      return <HealingTakenContent {...props} targetType={targetType} />;
    },
  };
}
