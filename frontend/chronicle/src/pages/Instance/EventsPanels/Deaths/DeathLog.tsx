/**
 * Death Log panel - React component wrapper for chronological death tracking
 */

import { ScrollText } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { deathsProcessor, type DeathsResult } from "./deaths.processor";
import { DeathLogContent } from "./DeathLogContent";

/**
 * Create the Death Log panel definition.
 * Reuses the same processor as Deaths panel but with a different view.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createDeathLogPanel(): PanelDefinition<DeathsResult, any> {
  return {
    ...deathsProcessor,
    id: "death_log", // Override the id to differentiate from deaths panel
    label: "Death Log",
    icon: <ScrollText className="h-4 w-4" />,
    checkboxLabel: "Encounter offset",
    defaultFilters: [
      { type: "time_range" as const, value: "controller", applyTo: ["slain", "damage", "heal", "resource_change", "absorbed", "aura_cast"] },
    ],

    render: (props: PanelRenderProps<DeathsResult>) => {
      return <DeathLogContent {...props} />;
    },
  };
}
