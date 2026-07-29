import { Activity } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import type { StatusProcessorEvent, StatusResult } from "./status.processor";
import { statusProcessor } from "./status.processor";
import { StatusContent } from "./StatusContent";

export function createStatusPanel(): PanelDefinition<StatusResult, StatusProcessorEvent> {
  return {
    ...statusProcessor,
    label: "Status",
    icon: <Activity className="h-4 w-4" />,
    syncDataMode: "full",
    supportsFiltering: true,
    underConstruction: true,
    render: (props: PanelRenderProps<StatusResult>) => <StatusContent {...props} />,
  };
}
