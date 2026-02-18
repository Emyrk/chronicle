import { getAllPanelTypes } from "../panels/registry";
import { Plus } from "lucide-react";

interface AddPanelDrawerProps {
  onAddPanel: (panelType: string) => void;
}

export function AddPanelDrawer({ onAddPanel }: AddPanelDrawerProps) {
  const panelTypes = getAllPanelTypes();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        Add Panel
      </h3>
      <div className="grid gap-2">
        {panelTypes.map(({ type, definition }) => (
          <button
            key={type}
            onClick={() => onAddPanel(type)}
            className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary hover:bg-muted/50 transition-colors text-left"
          >
            <div className="text-muted-foreground">{definition.icon}</div>
            <div className="flex-1">
              <div className="text-sm font-medium">{definition.label}</div>
              <div className="text-xs text-muted-foreground">{definition.description}</div>
            </div>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
