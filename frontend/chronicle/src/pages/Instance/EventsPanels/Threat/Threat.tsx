/**
 * Threat (estimated) panel: one enemy's estimated threat table (see docs/threat-estimate.md).
 */

import { Flame } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { threatProcessor, type ThreatResult } from "./threat.processor";
import { ThreatContent } from "./ThreatContent";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createThreatPanel(): PanelDefinition<ThreatResult, any> {
  return {
    ...threatProcessor,
    label: "Threat (estimated)",
    icon: <Flame className="h-4 w-4" />,
    keybinds: [],
    render: (props: PanelRenderProps<ThreatResult>) => <ThreatContent {...props} />,
  };
}
