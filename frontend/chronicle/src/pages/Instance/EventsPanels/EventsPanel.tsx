/**
 * EventsPanel - Container component for event aggregation panels
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ReactDOM from "react-dom";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { HelpCircle, Construction, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BreakoutHoverProvider } from "@/components/ui/AbilityBreakout";
import { Switch } from "@/components/ui/Switch/Switch";
import { HintTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { PanelCard } from "./PanelCard";
import { PanelFilterEditor } from "./PanelFilterEditor";
import type { PanelFilter, PanelFilterType } from "./processors/filters";
import { usePanelAggregation } from "./usePanelAggregation";
import { usePanelTiming } from "./PanelTimingContext";
import { useSyncModeContextOptional } from "../SyncModeContext";
import type { PanelDefinition, PanelContext } from "./types";
import { PanelSelector } from "./PanelSelector";
import { hasExplainer } from "./explainers";
import type { PlayerMetricChartData } from "@/components/ui/PlayerMetricChart/PlayerMetricChart";
import { useChartDataRegistry } from "./ChartDataRegistry";

// Import panel definitions
import { createDamageDonePanel } from "./DamageDone/DamageDone";
import { createVulnerabilityEffectPanel } from "./VulnerabilityEffect/VulnerabilityEffect";
import { createDamageTakenPanel } from "./DamageTaken/DamageTaken";
import { createHealingDonePanel } from "./HealingDone/HealingDone";
import { createExtraAttacksPanel } from "./ExtraAttacks/ExtraAttacks";
import { createHealingTakenPanel } from "./HealingTaken/HealingTaken";
import { createDeathsPanel } from "./Deaths/Deaths";
import { createDeathLogPanel } from "./Deaths/DeathLog";
import { AllActivityPanel } from "./AllActivityDebug";
import { createMitigationPanel } from "./Mitigation/Mitigation";
import { createRolesPanel } from "./Roles/Roles";
import { createEmptyPanel } from "./Empty/Empty";
import { createResourceRegenPanel } from "./ResourceRegen/ResourceRegen";
import { createInnervatePanel } from "./Innervate/Innervate";
import { createSunderPanel } from "./Sunder/Sunder";
import { createJudgementPanel } from "./Judgement/Judgement";
import { createAuraUptimePanel } from "./AuraUptime/AuraUptime";
import { createMetricsPanel } from "./Metrics/Metrics";
import { PeriodsPanel } from "./PeriodsPanel/PeriodsPanel";
import { createComparisonPanel } from "./ComparisonPanel/ComparisonPanel";
// TODO: Avoidance panel requires spell school data which isn't available yet
// import { createAvoidancePanel } from "./Avoidance/Avoidance";

// Registry of all available panels
// Using `any` here to allow different result types per panel.
// Type safety is maintained within each panel definition.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANELS: Record<string, PanelDefinition<any, any>> = {
  damage_done: createDamageDonePanel("players"),
  vulnerability_effect: createVulnerabilityEffectPanel(),
  enemy_damage_done: createDamageDonePanel("enemies"),
  pet_damage_done: createDamageDonePanel("pets"),
  damage_done_friendly_fire: createDamageDonePanel("friendly_fire"),
  damage_taken: createDamageTakenPanel("players"),
  enemy_damage_taken: createDamageTakenPanel("enemies"),
  healing_done: createHealingDonePanel("players"),
  healing_taken: createHealingTakenPanel("players"),
  extra_attacks: createExtraAttacksPanel(),
  deaths: createDeathsPanel(),
  death_log: createDeathLogPanel(),
  mitigation: createMitigationPanel(),
  // TODO: Avoidance panel requires spell school data which isn't available yet
  // avoidance: createAvoidancePanel(),
  resource_regen: createResourceRegenPanel(),
  roles: createRolesPanel(),
  all_activity: AllActivityPanel,
  empty: createEmptyPanel(),
  // Class: Druid
  innervate: createInnervatePanel(),
  // Class: Warrior
  sunder: createSunderPanel(),
  // Class: Paladin
  judgement: createJudgementPanel(),
  // Aura tracking
  aura_uptime: createAuraUptimePanel(),
  // Debug/Analysis
  metrics: createMetricsPanel(),
  periods: PeriodsPanel,
  // Cross-panel comparison
  comparison: createComparisonPanel(),
};

export type EventsPanelType = keyof typeof PANELS;

/**
 * Get localStorage key for a panel's toggle state.
 * Each panel type has its own independent toggle state.
 */
function getToggleStorageKey(panelType: string): string {
  return `panel-toggle:${panelType}`;
}

function parsePanelOptionTokens(option: string | null | undefined): string[] {
  if (!option) return [];
  return option
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function buildPanelOptionFromTokens(tokens: string[]): string | null {
  if (tokens.length === 0) {
    return null;
  }
  return tokens.join(",");
}

// ---------------------------------------------------------------------------
// Filter summary for tooltip
// ---------------------------------------------------------------------------

const FILTER_TYPE_LABELS: Record<PanelFilterType, string> = {
  ability_name: "Ability Name",
  ability_id: "Ability ID",
  ability_school: "School",
  ability_hittype: "Hit Type",
  source_type: "Source",
  target_type: "Target",
  players: "Players",
  enemies: "Enemies",
};

function buildFilterGroups(filters: PanelFilter[]): PanelFilter[][] {
  const groups: PanelFilter[][] = [];
  let current: PanelFilter[] = [];
  for (let i = 0; i < filters.length; i++) {
    if (i > 0 && filters[i].combinator === "or") {
      current.push(filters[i]);
    } else {
      if (current.length) groups.push(current);
      current = [filters[i]];
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function FilterRow({ filter }: { filter: PanelFilter }) {
  const val = Array.isArray(filter.value) ? filter.value.join(", ") : filter.value;
  if (!val || (Array.isArray(filter.value) && filter.value.length === 0)) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {filter.negate && (
        <span className="text-red-400 font-semibold text-[10px]">NOT</span>
      )}
      <span className="text-muted-foreground">
        {FILTER_TYPE_LABELS[filter.type] ?? filter.type}:
      </span>
      <span className="font-medium truncate">{val}</span>
    </div>
  );
}

function FilterSummaryCard({ filters }: { filters: PanelFilter[] }) {
  const active = filters.filter((f) => {
    const v = f.value;
    return Array.isArray(v) ? v.length > 0 : String(v).trim() !== "";
  });

  if (active.length === 0) {
    return <span className="text-muted-foreground text-xs">Custom filters active</span>;
  }

  const groups = buildFilterGroups(active);

  return (
    <div className="space-y-1.5 max-w-xs">
      <div className="font-medium text-xs border-b border-border pb-1">
        Active Filters ({active.length})
      </div>
      {groups.map((group, gi) => (
        <div key={gi}>
          {gi > 0 && (
            <div className="text-[10px] text-muted-foreground uppercase my-1">and</div>
          )}
          {group.length === 1 ? (
            <FilterRow filter={group[0]} />
          ) : (
            <div className="border-l-2 border-emerald-500/40 pl-2 space-y-0.5">
              {group.map((f, fi) => (
                <div key={fi}>
                  {fi > 0 && (
                    <span className="text-[10px] text-emerald-400 uppercase">or</span>
                  )}
                  <FilterRow filter={f} />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">
        Click for menu actions
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter context menu (right-click)
// ---------------------------------------------------------------------------

function FilterContextMenu({
  position,
  onReset,
  onClose,
}: {
  position: { x: number; y: number };
  onReset: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handler = () => onClose();
    // Defer so the opening contextmenu event doesn't immediately close the menu
    const frame = requestAnimationFrame(() => {
      document.addEventListener("click", handler);
      document.addEventListener("contextmenu", handler);
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", handler);
      document.removeEventListener("contextmenu", handler);
    };
  }, [onClose]);

  return ReactDOM.createPortal(
    <div
      className="fixed z-50 min-w-[160px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: position.x, top: position.y }}
    >
      <button
        className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
        onClick={onReset}
      >
        Reset filters
      </button>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Panel option token helpers for borderColor / customTitle
// ---------------------------------------------------------------------------

function extractBorderColorFromTokens(tokens: string[]): string | null {
  const token = tokens.find((t) => t.startsWith("bc:"));
  return token ? token.slice(3) : null;
}

function extractCustomTitleFromTokens(tokens: string[]): string | null {
  const token = tokens.find((t) => t.startsWith("t:"));
  return token ? token.slice(2) : null;
}

function buildTokensWithMeta(
  baseTokens: string[],
  borderColor: string | null,
  customTitle: string | null,
): string[] {
  const filtered = baseTokens.filter((t) => !t.startsWith("bc:") && !t.startsWith("t:"));
  if (borderColor) filtered.push(`bc:${borderColor}`);
  if (customTitle) filtered.push(`t:${customTitle}`);
  return filtered;
}

export interface EventsPanelProps {
  panelType: EventsPanelType;
  onPanelTypeChange: (type: EventsPanelType) => void;
  durationMs: number;
  context: PanelContext;
  /** Unique index for timing tracking (0-3 for 4 panels) */
  panelIndex: number;
  /** Callback when user clicks the explainer button (? icon) */
  onExplainerClick?: (panelType: EventsPanelType) => void;
  /** Whether to show helpful hints (explainer button). Defaults to true. */
  showHints?: boolean;
  /** Panel-specific option (e.g., selected aura name) */
  panelOption?: string | null;
  /** Callback to update panel option */
  onPanelOptionChange?: (option: string | null) => void;
  /** Filters to seed when a shared layout is imported. Bumping the version re-applies. */
  seedFilters?: PanelFilter[];
  /** Incremented each time seedFilters should be (re-)applied. */
  seedFiltersVersion?: number;
  /** Called when user-defined filters change (for persistence in shared layouts) */
  onFiltersChange?: (filters: PanelFilter[]) => void;
}

export function EventsPanel({
  panelType,
  onPanelTypeChange,
  durationMs,
  context,
  panelIndex,
  onExplainerClick,
  showHints = true,
  panelOption,
  onPanelOptionChange,
  seedFilters,
  seedFiltersVersion,
  onFiltersChange,
}: EventsPanelProps) {
  const isMobile = useIsMobile();
  const panel = PANELS[panelType];

  // Determine checkbox label first (needed for storage key)
  const checkboxLabel = panel.checkboxLabel || "Per second";
  const showCheckbox = panel.supportsPerSecond || panel.checkboxLabel;
  const perSecondToggle = Boolean(panel.supportsPerSecond);

  // "Per second" toggles stay local-only by design.
  const [perSecondChecked, setPerSecondChecked] = useLocalStorage(
    getToggleStorageKey(panelType),
    false,
  );

  // Custom checkbox panels (e.g. Sunder "Show targets") serialize checkbox state in panelOption.
  const customToggleTokens = useMemo(() => parsePanelOptionTokens(panelOption), [panelOption]);
  const checkboxChecked = perSecondToggle
    ? perSecondChecked
    : customToggleTokens.includes("cb");

  const setCheckboxChecked = useCallback((checked: boolean) => {
    if (perSecondToggle) {
      setPerSecondChecked(checked);
      return;
    }

    if (!onPanelOptionChange) {
      return;
    }

    const nextTokens = customToggleTokens.filter((token) => token !== "cb");
    if (checked) {
      nextTokens.unshift("cb");
    }

    onPanelOptionChange(buildPanelOptionFromTokens(nextTokens));
  }, [customToggleTokens, onPanelOptionChange, perSecondToggle, setPerSecondChecked]);
  
  // Panel-scoped context for processor/render options (e.g., vulnerability school mask).
  const [panelContext, setPanelContext] = useState<Record<string, unknown> | null>(null);
  const [panelContextVersion, setPanelContextVersion] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [filterContextMenu, setFilterContextMenu] = useState<{ x: number; y: number } | null>(null);
  // Buffer filter edits while the card is flipped; apply on flip-back.
  const [pendingFilters, setPendingFilters] = useState<PanelFilter[] | null>(null);

  const customFilters = useMemo(() => (panelContext?.filters as PanelFilter[] | undefined) ?? null, [panelContext]);
  const syncMode = useSyncModeContextOptional();
  const isSyncActive = syncMode?.enabled === true;
  const filteringSupported = panel.supportsFiltering === true && !isSyncActive;
  const fixedFilters = panel.fixedFilters ?? [];
  const userFilters = customFilters ?? [];

  const hasCustomFilters = filteringSupported && customFilters !== null &&
    JSON.stringify(customFilters) !== JSON.stringify(panel.defaultFilters ?? []);

  // Border color and custom title derived from panelOption tokens
  const borderColor = useMemo(() => extractBorderColorFromTokens(customToggleTokens), [customToggleTokens]);
  const customTitle = useMemo(() => extractCustomTitleFromTokens(customToggleTokens), [customToggleTokens]);

  const setBorderColor = useCallback((color: string | null) => {
    if (!onPanelOptionChange) return;
    const tokens = buildTokensWithMeta(customToggleTokens, color, customTitle);
    onPanelOptionChange(buildPanelOptionFromTokens(tokens));
  }, [customToggleTokens, customTitle, onPanelOptionChange]);

  const setCustomTitle = useCallback((title: string | null) => {
    if (!onPanelOptionChange) return;
    const tokens = buildTokensWithMeta(customToggleTokens, borderColor, title);
    onPanelOptionChange(buildPanelOptionFromTokens(tokens));
  }, [customToggleTokens, borderColor, onPanelOptionChange]);

  // -- ChartDataRegistry: register/unregister for cross-panel comparison ------
  const chartRegistry = useChartDataRegistry();

  const registerChartData = useCallback(
    (data: PlayerMetricChartData[]) => {
      chartRegistry.register({
        panelIndex,
        panelType: panelType as EventsPanelType,
        label: customTitle || panel.label,
        borderColor,
        data,
      });
    },
    [chartRegistry, panelIndex, panelType, customTitle, panel.label, borderColor],
  );

  // Unregister when panel unmounts or panel type changes
  useEffect(() => {
    return () => {
      chartRegistry.unregister(panelIndex);
    };
  }, [chartRegistry, panelIndex, panelType]);

  const setPanelContextWithKey = useCallback((nextContext: Record<string, unknown> | null) => {
    setPanelContext(nextContext);
    setPanelContextVersion((version) => version + 1);
  }, []);

  const applyFilters = useCallback((filters: PanelFilter[]) => {
    setPanelContext((previous) => {
      const base = previous ?? {};
      if (filters.length === 0) {
        const { filters: _filters, ...rest } = base;
        return Object.keys(rest).length > 0 ? rest : null;
      }
      return { ...base, filters };
    });
    setPanelContextVersion((version) => version + 1);
    onFiltersChange?.(filters);
  }, [onFiltersChange]);

  const setFilters = useCallback((filters: PanelFilter[]) => {
    // Buffer edits while the filter editor is open; applied on flip-back.
    setPendingFilters(filters);
    // Eagerly notify parent so layout save always has the latest filters,
    // even while the card is still flipped.
    onFiltersChange?.(filters);
  }, [onFiltersChange]);

  const resetFilters = useCallback(() => {
    const defaults = panel.defaultFilters ?? [];
    applyFilters(defaults);
    setPendingFilters(null);
  }, [applyFilters, panel.defaultFilters]);

  const flipCard = useCallback(() => {
    setFlipped((prev) => {
      if (prev) {
        // Flipping back — apply buffered filters
        if (pendingFilters !== null) {
          applyFilters(pendingFilters);
          setPendingFilters(null);
        }
      } else {
        // Flipping open — seed buffer with current filters
        setPendingFilters(userFilters);
      }
      return !prev;
    });
  }, [pendingFilters, applyFilters, userFilters]);

  const closeFilterEditor = useCallback(() => {
    if (pendingFilters !== null) {
      applyFilters(pendingFilters);
      setPendingFilters(null);
    }
    setFlipped(false);
  }, [pendingFilters, applyFilters]);

  const onPanelMouseDown = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.shiftKey && event.button === 0 && !isSyncActive) {
      event.preventDefault();
      flipCard();
    }
  }, [isSyncActive, flipCard]);

  // Reset panel context when panel type changes to avoid leaking options across panel types.
  // Seed default filters if the panel defines them.
  useEffect(() => {
    const defaults = panel.defaultFilters;
    if (defaults && defaults.length > 0) {
      setPanelContext({ filters: defaults });
    } else {
      setPanelContext(null);
    }
    setPanelContextVersion((version) => version + 1);
    setFlipped(false);
    setPendingFilters(null);
    onFiltersChange?.(defaults ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on panelType change
  }, [panelType]);

  // Seed filters from shared layout / layout book. Only re-applies when the
  // parent bumps seedFiltersVersion (import / cast), NOT on every reference change.
  const appliedSeedVersion = useRef(-1);
  useEffect(() => {
    if (seedFiltersVersion == null || seedFiltersVersion === appliedSeedVersion.current) return;
    appliedSeedVersion.current = seedFiltersVersion;
    if (seedFilters && seedFilters.length > 0) {
      setPanelContext((prev) => ({ ...(prev ?? {}), filters: seedFilters }));
      setPanelContextVersion((v) => v + 1);
    }
  }, [seedFiltersVersion, seedFilters]);

  // Only show explainer button on desktop, if hints are enabled, and if panel has an explainer
  const showExplainerButton = showHints && !isMobile && hasExplainer(panelType) && onExplainerClick;

  // Only run aggregation if panel doesn't manage its own
  const {
    loading,
    processing,
    error,
    result,
    totalEvents,
    processingTimeMs,
    panelContextKey: aggregationContextKey,
  } = usePanelAggregation({
    panel,
    context,
    panelOption,
    panelContext,
    panelContextKey: panelContextVersion,
    panelIndex,
    enabled: !panel.selfManagesAggregation,
  });
  
  // Report timing when panel finishes loading
  // For self-managed panels, we can't track timing this way (they manage their own)
  const isDone = panel.selfManagesAggregation || processingTimeMs !== null;
  usePanelTiming(`panel-${panelIndex}`, isDone);

  const effectiveDurationMs = useMemo(() => {
    if (syncMode?.enabled && syncMode.currentTimestamp && syncMode.encounterBounds) {
      const elapsedMs =
        syncMode.currentTimestamp.getTime() - syncMode.encounterBounds.start.getTime();
      return Math.max(elapsedMs, 1);
    }

    return durationMs;
  }, [syncMode?.enabled, syncMode?.currentTimestamp, syncMode?.encounterBounds, durationMs]);

  return (
    <BreakoutHoverProvider>
      <PanelCard
        flipped={flipped}
        onMouseDown={onPanelMouseDown}
        underConstruction={panel.underConstruction}
        borderColor={borderColor}
        front={(
          <>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {customTitle ? (
                  <>
                    <span className="truncate max-w-[160px]">{customTitle}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      <PanelSelector value={panelType} onChange={onPanelTypeChange} />
                    </span>
                  </>
                ) : (
                  <PanelSelector value={panelType} onChange={onPanelTypeChange} />
                )}
                {hasCustomFilters && (
                  <>
                    <HintTooltip>
                      <TooltipTrigger asChild>
                        <span
                          className="text-emerald-500 cursor-pointer"
                          onClick={(e) => {
                            setFilterContextMenu({ x: e.clientX, y: e.clientY });
                          }}
                        >
                          <Filter className="h-3.5 w-3.5" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" hideArrow className="p-3 bg-card text-card-foreground border border-border">
                        <FilterSummaryCard filters={customFilters ?? []} />
                      </TooltipContent>
                    </HintTooltip>
                    {filterContextMenu && (
                      <FilterContextMenu
                        position={filterContextMenu}
                        onReset={() => { resetFilters(); setFilterContextMenu(null); }}
                        onClose={() => setFilterContextMenu(null)}
                      />
                    )}
                  </>
                )}
                {showExplainerButton && (
                  <HintTooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => onExplainerClick(panelType)}
                        data-help-panel-explainer
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        <span className="sr-only">Learn about this panel</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Learn about this panel</TooltipContent>
                  </HintTooltip>
                )}
                {panel.underConstruction && (
                  <HintTooltip>
                    <TooltipTrigger asChild>
                      <span className="text-yellow-500 cursor-help">
                        <Construction className="h-3.5 w-3.5" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[250px]">
                      <p className="text-xs">
                        This panel is under construction. Accuracy is not guaranteed and it may look different in the future. Ask in Discord for limitations.
                      </p>
                    </TooltipContent>
                  </HintTooltip>
                )}
              </h3>
              {showCheckbox && (
                <label
                  className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground pr-2"
                  data-per-second-toggle
                  data-help-per-second-toggle
                >
                  {checkboxLabel}
                  <Switch
                    size="sm"
                    checked={checkboxChecked}
                    onCheckedChange={setCheckboxChecked}
                  />
                </label>
              )}
            </div>

            <div className="flex-1 min-h-0">
              {panel.render({
                result,
                totalEvents,
                processingTimeMs,
                durationMs: effectiveDurationMs,
                perSecond: checkboxChecked,
                checkboxChecked,
                loading,
                processing,
                error,
                context,
                panelOption,
                setPanelOption: onPanelOptionChange,
                panelContext,
                panelContextVersion: `${panelContextVersion}|${aggregationContextKey}`,
                setPanelContext: setPanelContextWithKey,
                panelIndex,
                registerChartData,
              })}
            </div>
          </>
        )}
        back={(
          <PanelFilterEditor
            panelLabel={panel.label}
            panelIcon={panel.icon}
            fixedFilters={fixedFilters}
            filters={pendingFilters ?? userFilters}
            onChange={setFilters}
            onReset={resetFilters}
            onClose={closeFilterEditor}
            filteringSupported={filteringSupported}
            borderColor={borderColor}
            onBorderColorChange={onPanelOptionChange ? setBorderColor : undefined}
            customTitle={customTitle}
            onCustomTitleChange={onPanelOptionChange ? setCustomTitle : undefined}
          />
        )}
      />
    </BreakoutHoverProvider>
  );
}
