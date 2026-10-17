/**
 * Dispel Log panel - chronological list of dispel events.
 * Reuses the same processor as Dispels Done/Received but with a log view.
 */

import { ScrollText } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { dispelProcessor, type DispelResult } from "./dispel.processor";
import { DispelLogContent } from "./DispelLogContent";
import { ENTITY_GROUPING_OPTIONS, PET_MODE_OPTIONS } from "../processors/resolveEntity";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDispelLogPanel(): PanelDefinition<DispelResult, any> {
  return {
    ...dispelProcessor,
    id: "dispel_log",
    label: "Dispel Log",
    icon: <ScrollText className="h-4 w-4" />,
    keybinds: [],
    checkboxLabel: "Encounter offset",
    groupingOptions: ENTITY_GROUPING_OPTIONS,
    petOptions: PET_MODE_OPTIONS,
    supportsFiltering: true,
    defaultFilters: [
      { type: "time_range" as const, value: "controller" },
    ],

    render: (props: PanelRenderProps<DispelResult>) => {
      return <DispelLogContent {...props} />;
    },
  };
}
