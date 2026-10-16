/**
 * Extra Attacks panel - React component wrapper for extra attack aggregation
 * 
 * Tracks procs like Windfury, Sword Specialization, Hand of Justice, etc.
 */

import { Zap } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { extraAttacksProcessor, type ExtraAttacksResult } from "./extraAttacks.processor";
import { ExtraAttacksContent } from "./ExtraAttacksContent";
import { ENTITY_GROUPING_OPTIONS, PET_MODE_OPTIONS } from "../processors/resolveEntity";

/**
 * Create the ExtraAttacks panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createExtraAttacksPanel(): PanelDefinition<ExtraAttacksResult, any> {
  return {
    ...extraAttacksProcessor,
    label: "Extra Attacks",
    icon: <Zap className="h-4 w-4" />,
    keybinds: [],
    supportsPerSecond: true,
    supportsFiltering: true,
    groupingOptions: ENTITY_GROUPING_OPTIONS,
    petOptions: PET_MODE_OPTIONS,
    defaultFilters: [
      { type: "time_range" as const, value: "controller" },
      { type: "target_type" as const, value: ["player"], applyTo: ["extra_attack"] },
    ],
    
    render: (props: PanelRenderProps<ExtraAttacksResult>) => {
      return <ExtraAttacksContent {...props} />;
    },
  };
}
