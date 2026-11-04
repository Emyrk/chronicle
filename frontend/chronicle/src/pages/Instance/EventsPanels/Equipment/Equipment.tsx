import { equipmentProcessor, type EquipmentResult } from "./equipment.processor";
import type { CombatantInfoProcessorEvent } from "../processorTypes";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { Shirt } from "lucide-react";
import { EquipmentContent } from "./EquipmentContent";

export function createEquipmentPanel(): PanelDefinition<EquipmentResult, CombatantInfoProcessorEvent> {
  return {
    ...equipmentProcessor,
    label: "Equipment",
    icon: <Shirt className="h-4 w-4" />,
    keybinds: [],
    checkboxLabel: "Paper doll",
    renderOnlyOptionTokens: ["cb", "p:", "t:"],
    render: (props: PanelRenderProps<EquipmentResult>) => (
      <EquipmentContent {...props} />
    ),
  };
}
