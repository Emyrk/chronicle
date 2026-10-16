/**
 * Interrupt panel - React component wrapper for interrupt tracking.
 */

import { ShieldOff } from "lucide-react";
import type { PanelDefinition } from "../types";
import { interruptProcessor, type InterruptResult } from "./interrupt.processor";
import { InterruptContent } from "./InterruptContent";
import { MERGED_GROUPING_OPTIONS, PET_GROUPING_OPTIONS } from "../processors/resolveEntity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInterruptsPanel(): PanelDefinition<InterruptResult, any> {
  return {
    ...interruptProcessor,
    label: "Interrupts",
    icon: <ShieldOff className="h-4 w-4" />,
    keybinds: [{ keys: "Esc", action: "Return from a focused player to the player list" }],
    supportsPerSecond: true,
    supportsFiltering: true,
    groupingOptions: MERGED_GROUPING_OPTIONS,
    petOptions: PET_GROUPING_OPTIONS,
    defaultFilters: [
      { type: "time_range" as const, value: "controller" },
      { type: "source_type" as const, value: ["player", "pet"] },
    ],
    render: (props) => <InterruptContent {...props} />,
  };
}
