/**
 * ComparisonContent - Content component for the Comparison panel.
 *
 * Reads selected panel indices from panelOption, pulls their chart data
 * from the ChartDataRegistry, and renders a ComparisonChart.
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { BarChart3, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PanelRenderProps } from "../types";
import type { ComparisonResult } from "./comparison.processor";
import { useChartDataEntries, type ChartDataEntry } from "../ChartDataRegistry";
import { ComparisonChart, type ComparisonSource } from "./ComparisonChart";

type ComparisonContentProps = PanelRenderProps<ComparisonResult>;

/** Parse panelOption "0,2,3" → number[] */
function parseSelectedIndices(option: string | null | undefined): number[] {
  if (!option) return [];
  return option
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

function serializeIndices(indices: number[]): string | null {
  return indices.length > 0 ? indices.join(",") : null;
}

export function ComparisonContent(props: ComparisonContentProps) {
  const { panelOption, setPanelOption, panelIndex } = props;
  const entries = useChartDataEntries();

  const selectedIndices = useMemo(
    () => parseSelectedIndices(panelOption),
    [panelOption],
  );

  // Build sources from registry entries
  const sources: ComparisonSource[] = useMemo(() => {
    const result: ComparisonSource[] = [];
    for (const idx of selectedIndices) {
      const entry = entries.get(idx);
      if (entry) {
        result.push({
          label: entry.label,
          borderColor: entry.borderColor,
          data: entry.data,
        });
      }
    }
    return result;
  }, [selectedIndices, entries]);

  const togglePanel = (idx: number) => {
    if (!setPanelOption) return;
    const current = new Set(selectedIndices);
    if (current.has(idx)) {
      current.delete(idx);
    } else {
      current.add(idx);
    }
    setPanelOption(serializeIndices([...current]));
  };

  const removePanel = (idx: number) => {
    if (!setPanelOption) return;
    setPanelOption(serializeIndices(selectedIndices.filter((i) => i !== idx)));
  };

  // Available panels: those in the registry excluding our own panelIndex
  const availablePanels = useMemo(() => {
    const result: ChartDataEntry[] = [];
    for (const [, entry] of entries) {
      if (entry.panelIndex !== panelIndex) {
        result.push(entry);
      }
    }
    return result.sort((a, b) => a.panelIndex - b.panelIndex);
  }, [entries, panelIndex]);

  if (sources.length < 2) {
    return (
      <div className="flex flex-col h-full gap-2">
        <PanelPicker
          availablePanels={availablePanels}
          selectedIndices={selectedIndices}
          onToggle={togglePanel}
        />
        <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-2 px-4">
          <BarChart3 className="h-8 w-8 opacity-30" />
          <p>Select at least 2 panels to compare.</p>
          <p className="text-xs">
            Panels must have metric bar data and a{" "}
            <span className="font-medium text-foreground/70">border color</span>{" "}
            assigned to distinguish them.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-1">
      {/* Selected panels chips + add button */}
      <div className="flex items-center gap-1 flex-wrap">
        {selectedIndices.map((idx) => {
          const entry = entries.get(idx);
          if (!entry) return null;
          return (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted/60"
              style={{ borderLeft: `3px solid ${entry.borderColor || "#888"}` }}
            >
              <span className="truncate max-w-[80px]">{entry.label}</span>
              <button
                type="button"
                className="hover:text-destructive cursor-pointer"
                onClick={() => removePanel(idx)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <PanelPicker
          availablePanels={availablePanels}
          selectedIndices={selectedIndices}
          onToggle={togglePanel}
          compact
        />
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ComparisonChart sources={sources} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelPicker – dropdown to add/remove source panels
// ---------------------------------------------------------------------------

function PanelPicker({
  availablePanels,
  selectedIndices,
  onToggle,
  compact,
}: {
  availablePanels: ChartDataEntry[];
  selectedIndices: number[];
  onToggle: (idx: number) => void;
  compact?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const selectedSet = useMemo(() => new Set(selectedIndices), [selectedIndices]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-1 text-xs cursor-pointer rounded transition-colors",
          compact
            ? "px-1.5 py-0.5 bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground"
            : "px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary font-medium",
        )}
      >
        <Plus className="h-3 w-3" />
        {!compact && "Select panels"}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 z-50 w-[220px] bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="p-1 max-h-[200px] overflow-y-auto">
            {availablePanels.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                No panels with chart data available
              </div>
            ) : (
              availablePanels.map((entry) => {
                const selected = selectedSet.has(entry.panelIndex);
                return (
                  <button
                    key={entry.panelIndex}
                    type="button"
                    onClick={() => onToggle(entry.panelIndex)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 text-sm rounded-sm flex items-center gap-2",
                      "hover:bg-accent hover:text-accent-foreground cursor-pointer",
                      selected && "bg-accent/50",
                    )}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-sm shrink-0 border border-border"
                      style={{ background: entry.borderColor || "transparent" }}
                    />
                    <span className="flex-1 truncate">{entry.label}</span>
                    <span className="text-xs text-muted-foreground">#{entry.panelIndex + 1}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
