/**
 * Custom card-back editor for the Timeline panel.
 *
 * Tab layout:
 *  ⚙️ Settings | Series 1 | Series 2 | [+]
 *
 * Settings tab: bin size, title, border color.
 * Series tabs: name, stream source, aggregation, color, filters.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Settings, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterBlock } from "../FilterBlock";
import type { PanelFilter } from "../processors/filters";
import type { CardBackProps } from "../types";
import {
  type TimelineSourceType,
  type TimelineSeriesConfig,
  type TimelineSettings,
  type AggregationType,
  SERIES_COLORS,
  getSeriesConfigs,
  getTimelineSettings,
  createDefaultSeries,
  serializeTimelineConfig,
  hydrateFromPanelOption,
} from "./timelineTypes";
import { AGGREGATIONS, type AggregationDef } from "./aggregations";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";

/** Preset border colors (mirrors PanelFilterEditor). */
const PRESET_BORDER_COLORS: Array<string | null> = [
  null,
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
];

/** Available stream types with labels. */
const STREAM_OPTIONS: { value: TimelineSourceType; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "heal", label: "Healing" },
  { value: "effective_heal", label: "Effective Healing" },
  { value: "resource_change", label: "Resource" },
  { value: "extra_attack", label: "Extra Attack" },
  { value: "slain", label: "Deaths" },
];

/** Bin size presets. */
const BIN_PRESETS = [
  { label: "500ms", value: 500 },
  { label: "1s", value: 1000 },
  { label: "2s", value: 2000 },
  { label: "3s", value: 3000 },
  { label: "5s", value: 5000 },
  { label: "10s", value: 10000 },
];

/** Aggregation options from the registry. */
const AGG_OPTIONS = (Object.entries(AGGREGATIONS) as [AggregationType, AggregationDef][]).map(
  ([value, { label, description }]) => ({ value, label, description }),
);

const DEFAULT_FILTER: PanelFilter = { type: "ability_name", value: "" };

export function TimelineFilterEditor({
  panelContext,
  setPanelContext,
  onClose,
  onReset,
  panelLabel,
  panelIcon,
  borderColor,
  onBorderColorChange,
  customTitle,
  onCustomTitleChange,
  panelOption,
  setPanelOption,
}: CardBackProps) {
  // Hydrate panelContext from saved panelOption on first open
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current && !panelContext?.timelineSeries && panelOption) {
      const restored = hydrateFromPanelOption(panelOption);
      if (restored) {
        setPanelContext(restored);
      }
    }
    hydrated.current = true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally runs once

  const seriesConfigs = useMemo(() => getSeriesConfigs(panelContext), [panelContext]);
  const settings = useMemo(() => getTimelineSettings(panelContext), [panelContext]);

  // "settings" tab = index -1, series tabs = 0..N-1
  const [activeTab, setActiveTab] = useState(-1);

  // ── Helpers to update panelContext + persist to panelOption ────────────────

  const persistOption = useCallback(
    (series: TimelineSeriesConfig[], s: TimelineSettings) => {
      if (setPanelOption) {
        // Build the tl: token, preserving other tokens (bc:, t:, etc.)
        const existingTokens = (panelOption ?? "").split(",").filter((t) => t && !t.startsWith("tl:"));
        const tlToken = `tl:${serializeTimelineConfig(series, s)}`;
        existingTokens.push(tlToken);
        setPanelOption(existingTokens.join(","));
      }
    },
    [setPanelOption, panelOption],
  );

  const updateContext = useCallback(
    (series: TimelineSeriesConfig[], newSettings?: TimelineSettings) => {
      const effectiveSettings = newSettings ?? settings;
      setPanelContext({
        ...(panelContext ?? {}),
        timelineSeries: series,
        timelineSettings: effectiveSettings,
      });
      persistOption(series, effectiveSettings);
    },
    [panelContext, setPanelContext, settings, persistOption],
  );

  const updateSettings = useCallback(
    (newSettings: TimelineSettings) => {
      setPanelContext({
        ...(panelContext ?? {}),
        timelineSeries: seriesConfigs,
        timelineSettings: newSettings,
      });
      persistOption(seriesConfigs, newSettings);
    },
    [panelContext, setPanelContext, seriesConfigs, persistOption],
  );

  const updateSeries = useCallback(
    (index: number, patch: Partial<TimelineSeriesConfig>) => {
      const updated = seriesConfigs.map((s, i) => (i === index ? { ...s, ...patch } : s));
      updateContext(updated);
    },
    [seriesConfigs, updateContext],
  );

  const addSeries = useCallback(() => {
    const newSeries = createDefaultSeries(seriesConfigs, seriesConfigs.length);
    const updated = [...seriesConfigs, newSeries];
    updateContext(updated);
    setActiveTab(updated.length - 1);
  }, [seriesConfigs, updateContext]);

  const removeSeries = useCallback(
    (index: number) => {
      if (seriesConfigs.length <= 1) return; // keep at least one
      const updated = seriesConfigs.filter((_, i) => i !== index);
      updateContext(updated);
      setActiveTab(Math.min(activeTab, updated.length - 1));
    },
    [seriesConfigs, updateContext, activeTab],
  );

  const handleReset = useCallback(() => {
    onReset();
    setPanelContext(null);
    setActiveTab(-1);
  }, [onReset, setPanelContext]);

  // ── Render ────────────────────────────────────────────────────────────────

  const activeSeries = activeTab >= 0 && activeTab < seriesConfigs.length ? seriesConfigs[activeTab] : null;

  return (
    <div className="h-full flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          {panelIcon}
          {panelLabel ?? "Line Chart"}
        </h4>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleReset}>Reset</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Back</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0.5 border-b border-zinc-700/60 pb-0.5 overflow-x-auto styled-scrollbar">
        {/* Settings tab */}
        <button
          type="button"
          onClick={() => setActiveTab(-1)}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1 text-xs rounded-t transition-colors shrink-0",
            activeTab === -1
              ? "bg-zinc-700/60 text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-zinc-800/60",
          )}
        >
          <Settings className="h-3 w-3" />
          Settings
        </button>

        {/* Series tabs */}
        {seriesConfigs.map((cfg, i) => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => setActiveTab(i)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-t transition-colors shrink-0",
              activeTab === i
                ? "bg-zinc-700/60 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-zinc-800/60",
            )}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: cfg.color }}
            />
            <span className="truncate max-w-[80px]">{cfg.name}</span>
          </button>
        ))}

        {/* Add series button */}
        <button
          type="button"
          onClick={addSeries}
          className="px-1.5 py-1 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          title="Add series"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-auto styled-scrollbar">
        {activeTab === -1 && (
          <SettingsTab
            settings={settings}
            onSettingsChange={updateSettings}
            customTitle={customTitle}
            onCustomTitleChange={onCustomTitleChange}
            borderColor={borderColor}
            onBorderColorChange={onBorderColorChange}
          />
        )}

        {activeSeries && (
          <SeriesTab
            config={activeSeries}
            canDelete={seriesConfigs.length > 1}
            onUpdate={(patch) => updateSeries(activeTab, patch)}
            onDelete={() => removeSeries(activeTab)}
          />
        )}
      </div>
    </div>
  );
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function SettingsTab({
  settings,
  onSettingsChange,
  customTitle,
  onCustomTitleChange,
  borderColor,
  onBorderColorChange,
}: {
  settings: TimelineSettings;
  onSettingsChange: (s: TimelineSettings) => void;
  customTitle?: string | null;
  onCustomTitleChange?: (title: string | null) => void;
  borderColor?: string | null;
  onBorderColorChange?: (color: string | null) => void;
}) {
  return (
    <div className="space-y-3">
      {/* Background metric */}
      <label className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Background:</span>
        <select
          className="min-w-40 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-foreground focus:border-zinc-500 focus:outline-none"
          value={settings.background}
          onChange={(event) => onSettingsChange({
            ...settings,
            background: event.target.value === "raid_durability" ? "raid_durability" : "none",
          })}
        >
          <option value="none">None</option>
          <option value="raid_durability">Raid Durability</option>
        </select>
      </label>

      {/* Bin size */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Window:</span>
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5 flex-wrap">
          {BIN_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => onSettingsChange({ ...settings, binMs: preset.value })}
              className={cn(
                "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                settings.binMs === preset.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom title */}
      {onCustomTitleChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Title:</span>
          <input
            className="flex-1 bg-transparent border-b border-zinc-700 text-sm px-1 py-0.5 focus:outline-none focus:border-zinc-500"
            placeholder="Line Chart"
            value={customTitle ?? ""}
            onChange={(e) => onCustomTitleChange(e.target.value || null)}
          />
        </div>
      )}

      {/* Border color */}
      {onBorderColorChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">Border:</span>
          <div className="flex items-center gap-1.5">
            {PRESET_BORDER_COLORS.map((color) => (
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
                {color === null && <X className="h-3 w-3 mx-auto text-zinc-500" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Series tab ────────────────────────────────────────────────────────────────

function SeriesTab({
  config,
  canDelete,
  onUpdate,
  onDelete,
}: {
  config: TimelineSeriesConfig;
  canDelete: boolean;
  onUpdate: (patch: Partial<TimelineSeriesConfig>) => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-3">
      {/* Name */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Name:</span>
        <input
          className="flex-1 bg-transparent border-b border-zinc-700 text-sm px-1 py-0.5 focus:outline-none focus:border-zinc-500"
          value={config.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
      </div>

      {/* Source stream */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Source:</span>
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5 flex-wrap">
          {STREAM_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate({ stream: opt.value })}
              className={cn(
                "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                config.stream === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aggregation */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Agg:</span>
        <div className="flex items-center gap-0.5 bg-muted/50 rounded-md p-0.5 flex-wrap">
          {AGG_OPTIONS.map((opt) => (
            <Tooltip key={opt.value}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onUpdate({ aggregation: opt.value })}
                  className={cn(
                    "px-2 py-0.5 text-2xs rounded transition-colors cursor-pointer",
                    config.aggregation === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                {opt.description}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Color */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground shrink-0">Color:</span>
        <div className="flex items-center gap-1.5">
          {SERIES_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-all",
                color === config.color
                  ? "ring-2 ring-white/50 ring-offset-1 ring-offset-zinc-900"
                  : "border-zinc-600 hover:border-zinc-400",
              )}
              style={{ backgroundColor: color, borderColor: color }}
              onClick={() => onUpdate({ color })}
            />
          ))}
          {/* Custom RGB color picker */}
          <label
            className={cn(
              "h-5 w-5 rounded-full border-2 transition-all cursor-pointer overflow-hidden relative",
              !SERIES_COLORS.includes(config.color)
                ? "ring-2 ring-white/50 ring-offset-1 ring-offset-zinc-900"
                : "border-zinc-600 hover:border-zinc-400",
            )}
            style={{ backgroundColor: config.color }}
            title="Custom color"
          >
            <input
              type="color"
              value={config.color}
              onChange={(e) => onUpdate({ color: e.target.value })}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Filters</span>
        {config.filters.length === 0 && (
          <div className="text-xs text-zinc-500 italic">No filters — all events from this stream are included.</div>
        )}
        {(() => {
          // Group filters by combinator (AND separates groups, OR within groups)
          const groups: number[][] = [];
          let current: number[] = [];
          for (let i = 0; i < config.filters.length; i++) {
            if (i > 0 && config.filters[i].combinator === "or") {
              current.push(i);
            } else {
              if (current.length) groups.push(current);
              current = [i];
            }
          }
          if (current.length) groups.push(current);

          const toggleCombinator = (filterIndex: number) => {
            const updated = [...config.filters];
            updated[filterIndex] = {
              ...updated[filterIndex],
              combinator: updated[filterIndex].combinator === "or" ? "and" : "or",
            };
            onUpdate({ filters: updated });
          };

          const moveFilter = (from: number, to: number) => {
            const updated = [...config.filters];
            const [moved] = updated.splice(from, 1);
            updated.splice(to, 0, moved);
            for (let i = 0; i < updated.length; i++) {
              if (i === 0) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { combinator: _c, ...rest } = updated[i];
                updated[i] = rest;
              } else if (!updated[i].combinator) {
                updated[i] = { ...updated[i], combinator: "and" };
              }
            }
            onUpdate({ filters: updated });
          };

          return groups.map((group, groupIdx) => {
            const isMulti = group.length > 1;
            return (
              <div key={group[0]}>
                {/* AND connector between groups */}
                {groupIdx > 0 && (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 border-t border-zinc-700/60" />
                    <button
                      type="button"
                      onClick={() => toggleCombinator(group[0])}
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
                  {group.map((filterIdx, posInGroup) => {
                    const filter = config.filters[filterIdx];
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
                            const updated = [...config.filters];
                            updated[filterIdx] = next;
                            onUpdate({ filters: updated });
                          }}
                          onRemove={() => onUpdate({ filters: config.filters.filter((_, j) => j !== filterIdx) })}
                          onMoveUp={filterIdx > 0 ? () => moveFilter(filterIdx, filterIdx - 1) : undefined}
                          onMoveDown={filterIdx < config.filters.length - 1 ? () => moveFilter(filterIdx, filterIdx + 1) : undefined}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}
        <Button
          size="sm"
          variant="outline"
          onClick={() => onUpdate({ filters: [...config.filters, { ...DEFAULT_FILTER }] })}
        >
          + Add Filter
        </Button>
      </div>

      {/* Delete series */}
      {canDelete && (
        <div className="pt-2 border-t border-zinc-700/60">
          <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-300" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete Series
          </Button>
        </div>
      )}
    </div>
  );
}
