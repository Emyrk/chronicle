import { ShieldCheck } from "lucide-react";
import type { AuraProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { FriendlyClassBuffsContent } from "./FriendlyClassBuffsContent";
import {
  friendlyClassBuffsProcessor,
  type FriendlyClassBuffsResult,
} from "./friendlyClassBuffs.processor";

export function createFriendlyClassBuffsPanel(): PanelDefinition<FriendlyClassBuffsResult, AuraProcessorEvent> {
  return {
    ...friendlyClassBuffsProcessor,
    label: "Friendly Class Buffs",
    icon: <ShieldCheck className="h-4 w-4" />,
    underConstruction: true,
    syncDataMode: "full",
    renderOnlyOptionTokens: ["v:", "c:"],
    render: (props: PanelRenderProps<FriendlyClassBuffsResult>) => (
      <FriendlyClassBuffsContent {...props} />
    ),
  };
}
