import { equipmentProcessor, type EquipmentResult } from "./equipment.processor";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { Shirt } from "lucide-react";
import { EquipmentContent } from "./EquipmentContent";

export function createEquipmentPanel(): PanelDefinition<EquipmentResult, any> {
  return {
    ...equipmentProcessor,
    label: "Equipment",
    icon: <Shirt className="h-4 w-4" />,
    keybinds: [],
    render: (props: PanelRenderProps<EquipmentResult>) => (
      <EquipmentContent {...props} />
    ),
  };
}
