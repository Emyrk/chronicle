import { ScanSearch } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { UnitAurasContent } from "./UnitAurasContent";
import { unitAurasProcessor, type UnitAurasResult } from "./unitAuras.processor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createUnitAurasPanel(): PanelDefinition<UnitAurasResult, any> {
  return {
    ...unitAurasProcessor,
    label: "Unit Auras",
    icon: <ScanSearch className="h-4 w-4" />,
    supportsPerSecond: true,
    checkboxLabel: "Detailed",
    renderOnlyOptionTokens: ["u:"],
    render: (props: PanelRenderProps<UnitAurasResult>) => <UnitAurasContent {...props} />,
  };
}
