/**
 * Resists panel definition - factory for creating the Resists panel.
 */

import { ShieldAlert } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { DamageProcessorEvent } from "../processorTypes";
import type { ResistsResult } from "./resists.processor";
import { resistsProcessor } from "./resists.processor";
import { ResistsContent } from "./ResistsContent";

export function createResistsPanel(): PanelDefinition<ResistsResult, DamageProcessorEvent> {
  return {
    ...resistsProcessor,
    label: "Resists",
    icon: <ShieldAlert className="h-4 w-4" />,
    keybinds: [{ keys: "Esc", action: "Return from a focused player to the player list" }],
    supportsPerSecond: false,
    underConstruction: true,
    supportsFiltering: true,
    fixedFilters: [
      { type: "target_type" as const, value: ["player", "pet"], applyTo: ["damage"] },
    ],
    defaultFilters: [
      { type: "time_range" as const, value: "controller", applyTo: ["damage"] },
      { type: "source_type" as const, value: "selected_enemies", applyTo: ["damage"] },
    ],
    render: (props: PanelRenderProps<ResistsResult>) => {
      return <ResistsContent {...props} />;
    },
  };
}
