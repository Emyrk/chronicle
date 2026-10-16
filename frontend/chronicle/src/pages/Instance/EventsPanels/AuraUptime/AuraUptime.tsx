/**
 * Aura Uptime panel - Shows buff/debuff uptime on targets.
 * 
 * Features:
 * - Searchable dropdown to select an aura
 * - Table showing uptime per target with count and percentage
 * - Timeline visualization showing when the aura was active
 */

import { Sparkles } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { auraUptimeProcessor, type AuraUptimeResult } from "./auraUptime.processor";
import { AuraUptimeContent } from "./AuraUptimeContent";

/**
 * Create the Aura Uptime panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAuraUptimePanel(): PanelDefinition<AuraUptimeResult, any> {
  return {
    ...auraUptimeProcessor,
    label: "Aura Uptime",
    icon: <Sparkles className="h-4 w-4" />,
    keybinds: [],
    checkboxLabel: "Duration",
    underConstruction: true,

    render: (props: PanelRenderProps<AuraUptimeResult>) => {
      return <AuraUptimeContent {...props} />;
    },
  };
}
