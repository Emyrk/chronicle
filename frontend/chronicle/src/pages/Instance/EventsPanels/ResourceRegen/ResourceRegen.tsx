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
    
    render: (props: PanelRenderProps<ResourceRegenResult>) => {
      return <ResourceRegenContent {...props} />;
    },
  };
}
