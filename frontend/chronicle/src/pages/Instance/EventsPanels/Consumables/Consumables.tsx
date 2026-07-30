/**
 * Consumables Log panel - chronological list of physical consumable uses.
 *
 * Counts distinct consumeIds from the backend consume evidence stream after
 * deduplicating projected observations by evidenceId (#198). Each row expands
 * to show the evidence observations behind the use.
 */

import { FlaskConical } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { consumablesProcessor, type ConsumablesResult } from "./consumables.processor";
import { ConsumablesContent } from "./ConsumablesContent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createConsumablesPanel(): PanelDefinition<ConsumablesResult, any> {
  return {
    ...consumablesProcessor,
    label: "Consumables Log",
    icon: <FlaskConical className="h-4 w-4" />,
    checkboxLabel: "Encounter offset",
    underConstruction: true,
    supportsFiltering: true,
    defaultFilters: [
      // Non-players (e.g. NPCs drinking potions) are excluded by default.
      { type: "source_type" as const, value: ["player"], applyTo: ["consume"] },
    ],

    render: (props: PanelRenderProps<ConsumablesResult>) => {
      return <ConsumablesContent {...props} />;
    },
  };
}
