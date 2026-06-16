/**
 * Dispel panel content - renders dispel metrics with category filtering.
 *
 * Follows the ResourceRegenContent pattern: the processor stores all dispel categories,
 * and the UI filters by selected category at render time via a button-group selector.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, Skull, Bug, Droplets, HelpCircle } from "lucide-react";
import { PlayerMetricChart, type PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { ScrollArea } from "@/components/ui/ScrollArea/ScrollArea";
import { useSpell } from "@/api/queries";
import { useDatasetId } from "@/hooks/useDatasetId";
import { SpellIconWithTooltip } from "@/components/ui/SpellIconWithTooltip";
import { ChevronLeft } from "lucide-react";
import { useBreakoutHover } from "@/components/ui/AbilityBreakout/BreakoutHoverContext";
import { RowContextMenu, getArmoryUrl } from "@/components/ui/PlayerMetricChart/RowContextMenu";
import { GenericPanel } from "../GenericPanel";
import type { PanelRenderProps } from "../types";
import {
  type DispelResult,
  type DispelCategory,
  type DispelEntityData,
  ALL_DISPEL_CATEGORIES,
} from "./dispel.processor";
import { useCachedValue } from "@/hooks/useCachedValue";
import { formatNumber } from "@/lib/format";

const FOCUS_PREFIX = "f:";

function parseFocusFromOption(option: string | null | undefined): string | null {
  if (!option) return null;
  const token = option.split(",").find(t => t.startsWith(FOCUS_PREFIX));
  return token ? token.slice(FOCUS_PREFIX.length) : null;
}

function updatePanelOptionToken(
  current: string | null | undefined,
  prefix: string,
  value: string | null,
): string | null {
  const tokens = current ? current.split(",").filter(t => !t.startsWith(prefix)) : [];
  if (value) tokens.push(`${prefix}${value}`);
  return tokens.length > 0 ? tokens.join(",") : null;
}

// ============================================================================
// Category config
// ============================================================================

interface CategoryConfig {
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

const CATEGORY_CONFIG: Record<DispelCategory, CategoryConfig> = {
  All: {
    icon: null,
    color: "text-foreground",
    bgColor: "bg-foreground/10",
    borderColor: "border-foreground/50",
  },
  Magic: {
    icon: <Sparkles className="h-3.5 w-3.5" />,
    color: "text-blue-400",
    bgColor: "bg-blue-500/20",
    borderColor: "border-blue-500",
  },
  Curse: {
    icon: <Skull className="h-3.5 w-3.5" />,
    color: "text-purple-400",
    bgColor: "bg-purple-500/20",
    borderColor: "border-purple-500",
  },
  Disease: {
    icon: <Bug className="h-3.5 w-3.5" />,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/20",
    borderColor: "border-yellow-500",
  },
  Poison: {
    icon: <Droplets className="h-3.5 w-3.5" />,
    color: "text-green-400",
    bgColor: "bg-green-500/20",
    borderColor: "border-green-500",
  },
  Other: {
    icon: <HelpCircle className="h-3.5 w-3.5" />,
    color: "text-muted-foreground",
    bgColor: "bg-muted/50",
    borderColor: "border-muted-foreground/50",
  },
};

// ============================================================================
// Dispel Type Selector
// ============================================================================

interface DispelTypeSelectorProps {
  selected: Set<DispelCategory>;
  onChange: (type: DispelCategory) => void;
  availableTypes: Set<DispelCategory>;
}

function DispelTypeSelector({ selected, onChange, availableTypes }: DispelTypeSelectorProps) {
  // Always show "All", then only categories with data
  const visibleTypes = ALL_DISPEL_CATEGORIES.filter(
    (t) => t === "All" || availableTypes.has(t),
  );

  if (visibleTypes.length <= 1) return null; // Only "All" — no point showing selector

  const allSelected = selected.size === 0;

  return (
    <div className="flex items-center gap-1">
      {visibleTypes.map((type) => {
        const config = CATEGORY_CONFIG[type];
        const isSelected = type === "All" ? allSelected : selected.has(type);

        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all cursor-pointer",
              "border",
              isSelected
                ? cn(config.bgColor, config.borderColor, config.color)
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
            title={type}
          >
            {config.icon}
            <span className="hidden sm:inline">{type}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Breakout table (focus view)
// ============================================================================

interface DispelAbilityDisplay {
  spellId: number | null;
  name: string;
  count: number;
  dispelType: number;
}

/** Inline spell icon + name for breakout rows. */
function BreakoutSpellCell({ spellId, spellName }: { spellId: number | null; spellName: string }) {
  const datasetId = useDatasetId();
  const { data: spell } = useSpell(
    spellId != null && spellId > 0 ? String(spellId) : "",
    datasetId,
    { enabled: spellId != null && spellId > 0 },
  );

  return (
    <span className="inline-flex items-center gap-1">
      {spell ? (
        <SpellIconWithTooltip spell={spell} size={14}>
          {spellName}
        </SpellIconWithTooltip>
      ) : (
        spellName
      )}
    </span>
  );
}

function DispelBreakoutTable({ abilities, total }: { abilities: DispelAbilityDisplay[]; total: number }) {
  const { hover, setHover, clearHover } = useBreakoutHover();

  if (!abilities || abilities.length === 0) {
    return <p className="text-xs p-2 text-muted-foreground">No ability breakdown available</p>;
  }

  const sorted = [...abilities].sort((a, b) => b.count - a.count);

  return (
    <ScrollArea className="max-h-panel">
      <table className="w-full text-xs text-foreground">
        <thead className="sticky top-0 bg-popover">
          <tr className="border-b border-border">
            <th className="text-left py-1.5 px-2 font-medium">Spell Dispelled</th>
            <th className="text-right py-1.5 px-2 font-medium">Count</th>
            <th className="text-right py-1.5 px-2 font-medium">%</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ability) => {
            const percent = total > 0 ? (ability.count / total) * 100 : 0;
            const key = ability.spellId != null ? String(ability.spellId) : ability.name;
            const rowHighlight = hover.rowId === ability.name;
            return (
              <tr
                key={key}
                className={cn(
                  "border-b border-border/10 hover:bg-muted/50",
                  rowHighlight && "bg-muted/80",
                )}
                onMouseEnter={() => setHover({ rowId: ability.name, columnId: null })}
                onMouseLeave={() => clearHover()}
              >
                <td className="py-1 px-2 max-w-[150px] truncate" title={ability.name}>
                  <BreakoutSpellCell spellId={ability.spellId} spellName={ability.name} />
                </td>
                <td className="text-right py-1 px-2 font-mono">{ability.count.toLocaleString()}</td>
                <td className="text-right py-1 px-2 font-mono text-muted-foreground">
                  {percent.toFixed(1)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollArea>
  );
}

// ============================================================================
// Aggregation helpers
// ============================================================================

export type DispelPerspective = "done" | "received";

function getPerspectiveMap(result: DispelResult, perspective: DispelPerspective) {
  return perspective === "done" ? result.byCaster : result.byTarget;
}

function getAvailableDispelTypes(
  result: DispelResult,
  perspective: DispelPerspective,
  selectedEncounterIds: string[],
): Set<DispelCategory> {
  const available = new Set<DispelCategory>();
  const perspectiveMap = getPerspectiveMap(result, perspective);
  for (const encId of selectedEncounterIds) {
    const catMap = perspectiveMap.get(encId);
    if (!catMap) continue;
    for (const cat of catMap.keys()) {
      if (cat !== "All") available.add(cat);
    }
  }
  return available;
}

/** Resolve which category keys to iterate based on selection. Empty set = "All". */
function resolveCategories(
  selected: Set<DispelCategory>,
  catMap: Map<DispelCategory, Map<string, DispelEntityData>>,
): DispelCategory[] {
  if (selected.size === 0) return ["All"];
  // If only one selected, use it directly; otherwise iterate each
  return Array.from(selected).filter((c) => catMap.has(c));
}

function aggregateForEncounters(
  result: DispelResult,
  perspective: DispelPerspective,
  categories: Set<DispelCategory>,
  selectedEncounterIds: string[],
  selectedTargets: Set<string>,
): PlayerMetricChartData[] {
  const aggregated = new Map<string, PlayerMetricChartData>();
  const perspectiveMap = getPerspectiveMap(result, perspective);

  for (const encId of selectedEncounterIds) {
    const catMap = perspectiveMap.get(encId);
    if (!catMap) continue;

    const cats = resolveCategories(categories, catMap);
    for (const category of cats) {
      const entityMap = catMap.get(category);
      if (!entityMap) continue;

      for (const [entityID, data] of entityMap) {
        const existing = aggregated.get(entityID);
        if (existing) {
          existing.value += data.totalDispels;
        } else {
          aggregated.set(entityID, {
            playerID: data.entityID,
            playerName: data.entityName,
            className: data.className,
            specialization: "",
            value: data.totalDispels,
            dimmed: selectedTargets.size !== 0 && !selectedTargets.has(entityID),
          });
        }
      }
    }
  }

  return Array.from(aggregated.values());
}

function getEntityDispelData(
  result: DispelResult,
  perspective: DispelPerspective,
  categories: Set<DispelCategory>,
  entityID: string,
  selectedEncounterIds: string[],
): DispelEntityData | null {
  const perspectiveMap = getPerspectiveMap(result, perspective);
  const merged: DispelEntityData = {
    entityID,
    entityName: "",
    className: "",
    totalDispels: 0,
    bySpell: new Map(),
  };

  for (const encId of selectedEncounterIds) {
    const catMap = perspectiveMap.get(encId);
    if (!catMap) continue;

    const cats = resolveCategories(categories, catMap);
    for (const category of cats) {
      const entityMap = catMap.get(category);
      if (!entityMap) continue;
      const data = entityMap.get(entityID);
      if (!data) continue;

      merged.entityName = data.entityName;
      merged.className = data.className;
      merged.totalDispels += data.totalDispels;
      for (const [key, spell] of data.bySpell) {
        const existing = merged.bySpell.get(key);
        if (existing) {
          existing.count += spell.count;
        } else {
          merged.bySpell.set(key, { ...spell });
        }
      }
    }
  }

  return merged.totalDispels > 0 ? merged : null;
}

// ============================================================================
// Main content component
// ============================================================================

export interface DispelContentProps extends PanelRenderProps<DispelResult> {
  perspective: DispelPerspective;
}

export function DispelContent(props: DispelContentProps) {
  // Ctrl+click context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; playerId: string; playerName: string;
  } | null>(null);

  const focusedPlayerId = useMemo(() => parseFocusFromOption(props.panelOption), [props.panelOption]);
  const setFocusedPlayerId = useCallback((id: string | null) => {
    if (!props.setPanelOption) return;
    props.setPanelOption(updatePanelOptionToken(props.panelOption, FOCUS_PREFIX, id));
  }, [props.setPanelOption, props.panelOption]);

  const { result, context, loading, processing, perspective } = props;

  const { cachedValue: cachedResult, hasCache: hasData } = useCachedValue(
    result,
    (r) => !!r && r.byCaster instanceof Map && r.byCaster.size > 0,
    [props.panelContextVersion],
  );

  const [selectedCategories, setSelectedCategories] = useState<Set<DispelCategory>>(new Set());

  const handleToggleCategory = useCallback((type: DispelCategory) => {
    if (type === "All") {
      setSelectedCategories(new Set());
      return;
    }
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Available categories
  const availableTypes = useMemo(() => {
    if (!cachedResult) return new Set<DispelCategory>();
    return getAvailableDispelTypes(cachedResult, perspective, context.selectedEncounterIds);
  }, [cachedResult, perspective, context.selectedEncounterIds]);

  // Effective categories: prune any that no longer have data
  const effectiveCategories = useMemo((): Set<DispelCategory> => {
    if (selectedCategories.size === 0) return new Set();
    const pruned = new Set<DispelCategory>();
    for (const c of selectedCategories) {
      if (availableTypes.has(c)) pruned.add(c);
    }
    return pruned;
  }, [availableTypes, selectedCategories]);

  // Aggregate data
  const chartData = useMemo(() => {
    if (!cachedResult) return [];
    return aggregateForEncounters(
      cachedResult,
      perspective,
      effectiveCategories,
      context.selectedEncounterIds,
      context.entitySelection.playerIds,
    );
  }, [cachedResult, perspective, effectiveCategories, context.selectedEncounterIds, context.entitySelection.playerIds]);

  // Register chart data for cross-panel comparison
  const { registerChartData } = props;
  useEffect(() => {
    registerChartData?.(chartData);
  }, [registerChartData, chartData]);

  const effectiveProps = {
    ...props,
    loading: hasData ? false : props.loading,
    processing: hasData ? false : props.processing,
  };

  const handleRowCtrlClick = useCallback((playerId: string, event: React.MouseEvent) => {
    const playerName = chartData.find(d => d.playerID === playerId)?.playerName ?? playerId;
    setContextMenu({ x: event.clientX, y: event.clientY, playerId, playerName });
  }, [chartData]);

  // ESC key to unfocus
  useEffect(() => {
    if (!focusedPlayerId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocusedPlayerId(null);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusedPlayerId, setFocusedPlayerId]);

  // Build per-ability data for the focused player
  const focusedPlayer = focusedPlayerId
    ? chartData.find(d => d.playerID === focusedPlayerId)
    : null;

  const focusedAbilityData = useMemo(() => {
    if (!focusedPlayerId || !cachedResult) return null;
    const abilityMap = perspective === "done"
      ? cachedResult.casterByAbility.get(focusedPlayerId)
      : cachedResult.targetByAbility.get(focusedPlayerId);
    if (!abilityMap || abilityMap.size === 0) return null;

    const barClassName = focusedPlayer?.className ?? "foreground";
    const data: PlayerMetricChartData[] = [];
    for (const [abilityName, count] of abilityMap) {
      data.push({
        playerID: abilityName,
        playerName: abilityName,
        className: barClassName,
        specialization: "",
        value: count,
      });
    }
    return data.sort((a, b) => b.value - a.value);
  }, [focusedPlayerId, cachedResult, perspective, focusedPlayer?.className]);

  // Breakout function
  const breakout = useCallback(
    (playerID: string) => {
      if (loading || processing) {
        return (
          <div className="p-4 flex items-center justify-center text-xs text-muted-foreground min-w-[300px] min-h-[200px]">
            {loading ? "Loading..." : "Processing..."}
          </div>
        );
      }
      if (!cachedResult) {
        return <p className="text-xs p-2 text-muted-foreground">No breakdown available</p>;
      }

      const entityData = getEntityDispelData(
        cachedResult,
        perspective,
        effectiveCategories,
        playerID,
        context.selectedEncounterIds,
      );

      if (!entityData) {
        return <p className="text-xs p-2 text-muted-foreground">No dispel data</p>;
      }

      const abilities: DispelAbilityDisplay[] = Array.from(entityData.bySpell.values());

      return (
        <div>
          <div className="flex items-center border-b border-border">
            <span className="px-2 py-1 text-2xs font-medium text-foreground border-b-2 border-foreground">
              By Spell
            </span>
            <span className="text-2xs ml-auto pr-1.5 text-muted-foreground">
              Total: <span className="font-medium font-mono text-foreground">{entityData.totalDispels}</span> dispels
            </span>
          </div>
          <DispelBreakoutTable abilities={abilities} total={entityData.totalDispels} />
        </div>
      );
    },
    [cachedResult, perspective, effectiveCategories, context.selectedEncounterIds, loading, processing],
  );

  // Total
  const total = chartData.reduce((sum, d) => sum + d.value, 0);
  const displayTotal = formatNumber(total, 0);

  return (
    <GenericPanel {...effectiveProps}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Total: <span className="font-medium font-mono text-foreground">{displayTotal}</span>
        </div>
        <DispelTypeSelector
          selected={effectiveCategories}
          onChange={handleToggleCategory}
          availableTypes={availableTypes}
        />
      </div>
      {/* Focus header with back button */}
      {focusedPlayerId && focusedAbilityData && (
        <div className="flex items-center gap-1.5 mb-1">
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
            onClick={() => setFocusedPlayerId(null)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="text-xs font-medium">
            {focusedPlayer?.playerName}
          </span>
        </div>
      )}

      {focusedPlayerId && focusedAbilityData ? (
        <PlayerMetricChart
          data={focusedAbilityData}
          type="healing"
          panelTitle="Ability Breakdown"
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      ) : (
        <PlayerMetricChart
          data={chartData}
          type={"healing"}
          panelTitle={perspective === "done" ? "Dispels Done" : "Dispels Received"}
          duration_millis={props.durationMs}
          perSecond={props.perSecond}
          breakout={breakout}
          onRowCtrlClick={handleRowCtrlClick}
          disableInteractions={props.context.renderMode === "layout_lab"}
        />
      )}
      {contextMenu && (
        <RowContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          playerName={contextMenu.playerName}
          onFocus={() => { setFocusedPlayerId(contextMenu.playerId); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
          armoryUrl={getArmoryUrl(props.context.instance, contextMenu.playerId)}
        />
      )}
    </GenericPanel>
  );
}
