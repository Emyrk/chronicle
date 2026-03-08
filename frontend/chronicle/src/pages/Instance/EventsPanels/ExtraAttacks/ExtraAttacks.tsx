/**
 * Extra Attacks panel - React component wrapper for extra attack aggregation
 * 
 * Tracks procs like Windfury, Sword Specialization, Hand of Justice, etc.
 */

import { Zap } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { extraAttacksProcessor, type ExtraAttacksResult } from "./extraAttacks.processor";
import { ExtraAttacksContent } from "./ExtraAttacksContent";

/**
 * Create the ExtraAttacks panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createExtraAttacksPanel(): PanelDefinition<ExtraAttacksResult, any> {
  return {
    ...extraAttacksProcessor,
    label: "Extra Attacks",
    icon: <Zap className="h-4 w-4" />,
    supportsPerSecond: true,
    supportsFiltering: true,
    
    render: (props: PanelRenderProps<ExtraAttacksResult>) => {
      return <ExtraAttacksContent {...props} />;
    },
  };
}
