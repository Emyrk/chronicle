/**
 * Interrupt Log panel - chronological list of interrupt events.
 * Reuses the same processor as Interrupts but with a log view.
 */

import { ScrollText } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { interruptProcessor, type InterruptResult } from "./interrupt.processor";
import { InterruptLogContent } from "./InterruptLogContent";
import { ENTITY_GROUPING_OPTIONS, PET_MODE_OPTIONS } from "../processors/resolveEntity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createInterruptLogPanel(): PanelDefinition<InterruptResult, any> {
  return {
    ...interruptProcessor,
    id: "interrupt_log",
    label: "Interrupt Log",
    icon: <ScrollText className="h-4 w-4" />,
    keybinds: [],
    checkboxLabel: "Encounter offset",
    groupingOptions: ENTITY_GROUPING_OPTIONS,
    petOptions: PET_MODE_OPTIONS,
    supportsFiltering: true,
    defaultFilters: [
      { type: "time_range" as const, value: "controller" },
    ],

    render: (props: PanelRenderProps<InterruptResult>) => {
      return <InterruptLogContent {...props} />;
    },
  };
}
