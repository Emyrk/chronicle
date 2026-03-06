import { useMemo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { FilterBlock } from "./FilterBlock";
import type { PanelFilter } from "./processors/filters";

/** Preset border colors available in the color picker. `null` = no border / default. */
const PRESET_COLORS: Array<string | null> = [
  null,
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
];

export interface PanelFilterEditorProps {
  /** Panel label shown as the heading on the back side. */
  panelLabel?: string;
  /** Panel icon rendered next to the label. */
  panelIcon?: ReactNode;
  /** Locked filters defined by the panel — always active, not editable. */
  fixedFilters?: PanelFilter[];
  /** User-editable filters. */
  filters: PanelFilter[];
  onChange: (filters: PanelFilter[]) => void;
  onClose: () => void;
  onReset: () => void;
  /** Whether this panel supports user-editable filters. */
  filteringSupported?: boolean;
  /** Current user-chosen border color. */
  borderColor?: string | null;
  /** Callback when border color changes. */
  onBorderColorChange?: (color: string | null) => void;
  /** Current custom title override. */
  customTitle?: string | null;
  /** Callback when custom title changes. */
  onCustomTitleChange?: (title: string | null) => void;
}

const DEFAULT_FILTER: PanelFilter = {
  type: "ability_name",
  value: "",
};

/** A group of filters connected by OR. Groups are AND'd together. */
interface FilterGroup {
  /** Indices into the flat filters array */
  indices: number[];
}

function buildGroups(filters: PanelFilter[]): FilterGroup[] {
  const groups: FilterGroup[] = [];
  let current: number[] = [];
  for (let i = 0; i < filters.length; i++) {
    if (i > 0 && filters[i].combinator === "or") {
      current.push(i);
    } else {
      if (current.length) groups.push({ indices: current });
      current = [i];
    }
  }
  if (current.length) groups.push({ indices: current });
  return groups;
}

export function PanelFilterEditor({
  panelLabel,
  panelIcon,
  fixedFilters = [],
  filters,
  onChange,
  onClose,
  onReset,
  filteringSupported = true,
  borderColor,
  onBorderColorChange,
  customTitle,
  onCustomTitleChange,
}: PanelFilterEditorProps) {
  const groups = useMemo(() => buildGroups(filters), [filters]);

  const toggleCombinator = (filterIndex: number) => {
    const updated = [...filters];
    updated[filterIndex] = {
      ...updated[filterIndex],
      combinator: updated[filterIndex].combinator === "or" ? "and" : "or",
    };
    onChange(updated);
  };

  const moveFilter = (from: number, to: number) => {
    const updated = [...filters];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    for (let i = 0; i < updated.length; i++) {
      if (i === 0) {
        const { combinator: _, ...rest } = updated[i];
        updated[i] = rest;
      } else if (!updated[i].combinator) {
        updated[i] = { ...updated[i], combinator: "and" };
      }
    }
    onChange(updated);
  };

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          {panelIcon}
          {panelLabel ?? "Panel Filters"}
        </h4>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onReset}>Reset</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Back</Button>
        </div>
      </div>
      {/* Custom title */}
      {onCustomTitleChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Title:</span>
          <input
            className="flex-1 bg-transparent border-b border-zinc-700 text-sm px-1 py-0.5 focus:outline-none focus:border-zinc-500"
            placeholder={panelLabel ?? "Panel title"}
            value={customTitle ?? ""}
            onChange={(e) => onCustomTitleChange(e.target.value || null)}
          />
        </div>
      )}

      {/* Border color picker */}
      {onBorderColorChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Border:</span>
          <div className="flex items-center gap-1.5">
            {PRESET_COLORS.map((color) => (
              <button
                key={color ?? "none"}
                type="button"
                className={cn(
                  "h-5 w-5 rounded-full border-2 transition-all",
                  color === borderColor
                    ? "ring-2 ring-white/50 ring-offset-1 ring-offset-zinc-900"
                    : "border-zinc-600 hover:border-zinc-400",
                )}
                style={color ? { backgroundColor: color, borderColor: color } : undefined}
                onClick={() => onBorderColorChange(color)}
                title={color ?? "Default (none)"}
              >
                {color === null && (
                  <X className="h-3 w-3 mx-auto text-zinc-500" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {filteringSupported && <>
      <p className="text-xs text-muted-foreground">
        Filters in the same group are OR'd. Groups are AND'd together. Click the connector to toggle.
      </p>
      <div className="flex-1 min-h-0 overflow-auto space-y-2">
        {/* Fixed/locked filters */}
        {fixedFilters.length > 0 && (
          <div className="space-y-1">
            {fixedFilters.map((filter, i) => (
              <div
                key={`fixed-${i}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded border border-zinc-700/40 bg-zinc-800/40 opacity-75"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 shrink-0">🔒</span>
                <span className="text-xs text-zinc-400">
                  {filter.negate ? "NOT " : ""}{filter.type.replace("_", " ")}
                </span>
                <span className="text-xs text-zinc-300 font-medium">
                  {Array.isArray(filter.value) ? filter.value.join(", ") : filter.value}
                </span>
                {filter.applyTo && filter.applyTo.length > 0 && (
                  <span className="text-[9px] text-zinc-500 ml-auto">
                    on {filter.applyTo.join(", ")}
                  </span>
                )}
              </div>
            ))}
            {/* AND separator between fixed and user filters */}
            {filters.length > 0 && (
              <div className="flex items-center gap-2 py-1">
                <div className="flex-1 border-t border-zinc-700/60" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">AND</span>
                <div className="flex-1 border-t border-zinc-700/60" />
              </div>
            )}
          </div>
        )}

        {/* User-editable filters */}
        {groups.map((group, groupIdx) => {
          const isMulti = group.indices.length > 1;
          return (
            <div key={group.indices[0]}>
              {/* AND connector between groups */}
              {groupIdx > 0 && (
                <div className="flex items-center gap-2 py-1.5">
                  <div className="flex-1 border-t border-zinc-700/60" />
                  <button
                    type="button"
                    onClick={() => toggleCombinator(group.indices[0])}
                    className="px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700/70 transition-colors"
                  >
                    AND
                  </button>
                  <div className="flex-1 border-t border-zinc-700/60" />
                </div>
              )}

              {/* Group card — OR'd filters share a card */}
              <div className={
                isMulti
                  ? "rounded-lg border border-blue-500/30 bg-blue-500/[0.04] p-1.5 space-y-0"
                  : ""
              }>
                {group.indices.map((filterIdx, posInGroup) => {
                  const filter = filters[filterIdx];
                  return (
                    <div key={filterIdx}>
                      {/* OR connector inside the group */}
                      {posInGroup > 0 && (
                        <div className="flex items-center justify-center py-0.5">
                          <button
                            type="button"
                            onClick={() => toggleCombinator(filterIdx)}
                            className="px-2.5 py-px rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                          >
                            OR
                          </button>
                        </div>
                      )}
                      <FilterBlock
                        filter={filter}
                        onChange={(next) => {
                          const updated = [...filters];
                          updated[filterIdx] = next;
                          onChange(updated);
                        }}
                        onRemove={() => onChange(filters.filter((_, i) => i !== filterIdx))}
                        onMoveUp={filterIdx > 0 ? () => moveFilter(filterIdx, filterIdx - 1) : undefined}
                        onMoveDown={filterIdx < filters.length - 1 ? () => moveFilter(filterIdx, filterIdx + 1) : undefined}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onChange([...filters, { ...DEFAULT_FILTER }])}
      >
        + Add Filter
      </Button>
      </>}

      {!filteringSupported && (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center px-6">
          Filtering is not currently supported on this panel.
        </div>
      )}
    </div>
  );
}
