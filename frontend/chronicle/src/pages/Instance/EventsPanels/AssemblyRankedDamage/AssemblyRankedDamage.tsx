import { Scale } from "lucide-react";
import type { DamageProcessorEvent, SlainProcessorEvent } from "../processorTypes";
import type { PanelDefinition } from "../types";
import {
  assemblyRankedDamageProcessor,
  type AssemblyRankedDamageResult,
} from "./assemblyRankedDamage.processor";
import { AssemblyRankedDamageContent } from "./AssemblyRankedDamageContent";

export function createAssemblyRankedDamagePanel(): PanelDefinition<
  AssemblyRankedDamageResult,
  DamageProcessorEvent | SlainProcessorEvent
> {
  return {
    ...assemblyRankedDamageProcessor,
    label: "Assembly Ranked Damage",
    icon: <Scale className="h-4 w-4" />,
    keybinds: [],
    supportsPerSecond: false,
    syncDataMode: "full",
    requiredFlavors: ["wrath"],
    render: (props) => <AssemblyRankedDamageContent {...props} />,
  };
}
