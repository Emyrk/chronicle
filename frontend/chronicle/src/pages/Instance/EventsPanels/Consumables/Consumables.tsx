/**
 * Consumables panel - per-player physical consumable use counts.
 *
 * Counts distinct consumeIds from the backend consume evidence stream after
 * deduplicating projected observations by evidenceId (#198).
 */

import { FlaskConical } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { consumablesProcessor, type ConsumablesResult } from "./consumables.processor";
import { ConsumablesContent } from "./ConsumablesContent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createConsumablesPanel(): PanelDefinition<ConsumablesResult, any> {
  return {
    ...consumablesProcessor,
    label: "Consumables",
    icon: <FlaskConical className="h-4 w-4" />,

    render: (props: PanelRenderProps<ConsumablesResult>) => {
      return <ConsumablesContent {...props} />;
    },
  };
}
