/**
 * Empty panel - A collapsed placeholder panel
 * 
 * When selected, the panel shows minimal content with a message.
 * Useful for users who want to reduce the number of visible panels.
 */

import { Square } from "lucide-react";
import type { PanelDefinition, PanelRenderProps } from "../types";
import { emptyProcessor, type EmptyResult } from "./empty.processor";

/**
 * Create the Empty panel definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createEmptyPanel(): PanelDefinition<EmptyResult, any> {
  return {
    ...emptyProcessor,
    label: "Empty",
    icon: <Square className="h-4 w-4" />,
    keybinds: [],
    supportsPerSecond: false,
    
    render: (props: PanelRenderProps<EmptyResult>) => {
      return <EmptyContent {...props} />;
    },
  };
}

function EmptyContent(_props: PanelRenderProps<EmptyResult>) {
  return (
    <div className="text-center py-2 text-muted-foreground text-sm">
      Select a panel type from the dropdown above
    </div>
  );
}
