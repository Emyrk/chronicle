/**
 * ComparisonContent - Content component for the Comparison panel.
 *
 * Reads selected panel indices from panelOption, pulls their chart data
 * from the ChartDataRegistry, and renders a ComparisonChart.
 */

import { useMemo, useCallback, useState, useRef, useEffect } from "react";
import { BarChart3, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/Switch/Switch";
import type { PanelRenderProps } from "../types";
import type { ComparisonResult } from "./comparison.processor";
import { useChartDataEntries, type ChartDataEntry } from "../ChartDataRegistry";
import { ComparisonChart, type ComparisonSource } from "./ComparisonChart";

export interface ComparisonContentProps extends PanelRenderProps<ComparisonResult> {
  /** Deterministic chart sources for Storybook and Remotion demos. */
  entriesOverride?: Map<string, ChartDataEntry>;
  /** Controlled picker state for frame-driven Remotion choreography. */
  pickerOpenOverride?: boolean;
  /** Disable CSS transitions while Remotion controls every visual frame. */
  disableChartTransitionsOverride?: boolean;
}

/** Parse panelOption "panel-1,panel-2,mo" → panel IDs only */
function parseSelectedIds(option: string | null | undefined): string[] {
  if (!option) return [];
  return option
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("panel-"));
}

/** Check whether the "mo" (matched-only) token is present in panelOption */
function hasMatchedOnlyToken(option: string | null | undefined): boolean {
  if (!option) return false;
  return option.split(",").some((s) => s.trim() === "mo");
}

/** Rebuild panelOption from panel IDs + matched-only flag */
function serializeOption(ids: string[], matchedOnly: boolean): string | null {
  const tokens = [...ids];
  if (matchedOnly) tokens.push("mo");
  return tokens.length > 0 ? tokens.join(",") : null;
}

export function ComparisonContent(props: ComparisonContentProps) {
  const {
    panelOption,
    setPanelOption,
    panelId,
    entriesOverride,
    pickerOpenOverride,
    disableChartTransitionsOverride,
  } = props;
  const registryEntries = useChartDataEntries();
  const entries = entriesOverride ?? registryEntries;

  const selectedIds = useMemo(
    () => parseSelectedIds(panelOption),
    [panelOption],
  );

  const matchedOnly = useMemo(
    () => hasMatchedOnlyToken(panelOption),
    [panelOption],
  );

  // Build sources from registry entries
  const sources: ComparisonSource[] = useMemo(() => {
    const result: ComparisonSource[] = [];
    for (const id of selectedIds) {
      const entry = entries.get(id);
      if (entry) {
        result.push({
          label: entry.label,
          borderColor: entry.borderColor,
          data: entry.data,
        });
      }
    }
    return result;
  }, [selectedIds, entries]);

  const togglePanel = useCallback(
    (id: string) => {
      if (!setPanelOption) return;
      const current = new Set(selectedIds);
      if (current.has(id)) {
        current.delete(id);
      } else {
        current.add(id);
      }
      setPanelOption(serializeOption([...current], matchedOnly));
    },
    [setPanelOption, selectedIds, matchedOnly],
  );

  const removePanel = useCallback(
    (id: string) => {
      if (!setPanelOption) return;
      setPanelOption(
        serializeOption(
          selectedIds.filter((i) => i !== id),
          matchedOnly,
        ),
      );
    },
    [setPanelOption, selectedIds, matchedOnly],
  );

  const toggleMatchedOnly = useCallback(() => {
    if (!setPanelOption) return;
    setPanelOption(serializeOption(selectedIds, !matchedOnly));
  }, [setPanelOption, selectedIds, matchedOnly]);

  // Available panels: those in the registry excluding our own panelId
  const availablePanels = useMemo(() => {
    const result: ChartDataEntry[] = [];
    for (const [, entry] of entries) {
      if (entry.panelId !== panelId) {
        result.push(entry);
      }
    }
    return result.sort((a, b) => a.panelIndex - b.panelIndex);
  }, [entries, panelId]);

  if (sources.length < 2) {
    return (
      <div className="flex flex-col h-full gap-2">
        <PanelPicker
          availablePanels={availablePanels}
          selectedIds={selectedIds}
          onToggle={togglePanel}
          openOverride={pickerOpenOverride}
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
      {/* Selected panels chips + matched-only toggle + add button */}
      <div className="flex items-center gap-1 flex-wrap">
        {selectedIds.map((id) => {
          const entry = entries.get(id);
          if (!entry) return null;
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted/60"
              style={{ borderLeft: `3px solid ${entry.borderColor || "#888"}` }}
            >
              <span className="truncate max-w-[80px]">{entry.label}</span>
              <button
                type="button"
                className="hover:text-destructive cursor-pointer"
                onClick={() => removePanel(id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <PanelPicker
          availablePanels={availablePanels}
          selectedIds={selectedIds}
          onToggle={togglePanel}
          compact
          openOverride={pickerOpenOverride}
        />
        {/* Spacer pushes the toggle to the right */}
        <span className="flex-1" />
        <label
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
          data-lesson-target="compare-panels"
          data-demo-matched-only
        >
          Matched only
          <Switch
            size="sm"
            checked={matchedOnly}
            onCheckedChange={toggleMatchedOnly}
          />
        </label>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ComparisonChart
          sources={sources}
          matchedOnly={matchedOnly}
          perSecond={props.perSecond}
          durationMs={props.durationMs}
          disableTransitions={disableChartTransitionsOverride}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelPicker – dropdown to add/remove source panels
// ---------------------------------------------------------------------------

function PanelPicker({
  availablePanels,
  selectedIds,
  onToggle,
  compact,
  openOverride,
}: {
  availablePanels: ChartDataEntry[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  compact?: boolean;
  openOverride?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = openOverride ?? internalOpen;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || openOverride !== undefined) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setInternalOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, openOverride]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  return (
    <div
      ref={containerRef}
      className="relative"
      data-lesson-target="compare-panels"
      data-demo-panel-picker
    >
      <button
        type="button"
        onClick={() => {
          if (openOverride === undefined) setInternalOpen(!isOpen);
        }}
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
        <div
          className={cn(
            "absolute left-0 top-full mt-1 z-50 w-[220px] bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden",
            openOverride === undefined && "animate-in fade-in-0 zoom-in-95",
          )}
          data-demo-panel-picker-menu
        >
          <div className="p-1 max-h-[200px] overflow-y-auto">
            {availablePanels.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                No panels with chart data available
              </div>
            ) : (
              availablePanels.map((entry) => {
                const selected = selectedSet.has(entry.panelId);
                return (
                  <button
                    key={entry.panelId}
                    type="button"
                    onClick={() => onToggle(entry.panelId)}
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
                    <span className="text-xs text-muted-foreground">
                      #{entry.panelIndex + 1}
                    </span>
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
