/**
 * Resource Regeneration panel - React component wrapper for resource tracking
 * 
 * Shows resource gains/losses (Mana, Rage, Energy, Health) with toggleable resource type.
 */

import { Droplets } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { resourceRegenProcessor, type ResourceRegenResult } from "./resourceRegen.processor";
import type { ResourceChangeProcessorEvent } from "../processorTypes";
import { ResourceRegenContent } from "./ResourceRegenContent";

/**
 * Create the ResourceRegenPanel definition.
 */
export function createResourceRegenPanel(): PanelDefinition<ResourceRegenResult, ResourceChangeProcessorEvent> {
  return {
    ...resourceRegenProcessor,
    label: "Resource Gains",
    icon: <Droplets className="h-4 w-4" />,
    supportsPerSecond: true,
    supportsFiltering: true,
    defaultFilters: [
      { type: "time_range" as const, value: "controller" },
      // Default to player targets (matches previous behavior). Users can edit
      // this filter to also see resource gains for pets and enemies.
      { type: "target_type" as const, value: "selected_players" },
    ],
    
    render: (props: PanelRenderProps<ResourceRegenResult>) => {
      return <ResourceRegenContent {...props} />;
    },
  };
}
