import { Button } from "@/components/ui/button";
import { FilterBlock } from "./FilterBlock";
import type { PanelFilter } from "./processors/filters";

export interface PanelFilterEditorProps {
  filters: PanelFilter[];
  onChange: (filters: PanelFilter[]) => void;
  onClose: () => void;
  onReset: () => void;
}

const DEFAULT_FILTER: PanelFilter = {
  type: "players",
  mode: "include",
  value: "selected",
};

export function PanelFilterEditor({ filters, onChange, onClose, onReset }: PanelFilterEditorProps) {
  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Panel Filters</h4>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReset}>Reset</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Back</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Include filters are grouped by type (OR within type, AND across types). Exclude filters always toss matches.</p>
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        {filters.map((filter, index) => (
          <FilterBlock
            key={`${filter.type}-${index}`}
            filter={filter}
            onChange={(next) => {
              const updated = [...filters];
              updated[index] = next;
              onChange(updated);
            }}
            onRemove={() => onChange(filters.filter((_, i) => i !== index))}
          />
        ))}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...filters, { ...DEFAULT_FILTER }])}
      >
        + Add Filter
      </Button>
    </div>
  );
}
