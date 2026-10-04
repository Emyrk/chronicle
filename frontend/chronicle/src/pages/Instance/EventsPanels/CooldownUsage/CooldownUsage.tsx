import { TimerReset } from "lucide-react";
import type { SpellGoProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { CooldownUsageContent } from "./CooldownUsageContent";
import { cooldownUsageProcessor, type CooldownUsageResult } from "./cooldownUsage.processor";

export function createCooldownUsagePanel(): PanelDefinition<CooldownUsageResult, SpellGoProcessorEvent> {
  return {
    ...cooldownUsageProcessor,
    label: "Cooldown Usage",
    icon: <TimerReset className="h-4 w-4" />,
    syncDataMode: "full",
    underConstruction: true,
    checkboxLabel: "Compact",
    renderOnlyOptionTokens: ["c:", "m:", "cb"],
    render: (props: PanelRenderProps<CooldownUsageResult>) => <CooldownUsageContent {...props} />,
  };
}
