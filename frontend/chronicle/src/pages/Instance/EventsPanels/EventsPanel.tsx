/**
 * EventsPanel - Container component for event aggregation panels
 */

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import ReactDOM from "react-dom";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { HelpCircle, Construction, Filter, EllipsisVertical, Copy, ClipboardPaste } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu/DropdownMenu";
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
import { useChartDataActions } from "./ChartDataRegistry";

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
import { createLeaderboardPanel } from "./LeaderboardPanel/LeaderboardPanel";
import { createResourceRegenPanel } from "./ResourceRegen/ResourceRegen";
import { createInnervatePanel } from "./Innervate/Innervate";
import { createSunderPanel } from "./Sunder/Sunder";
import { createJudgementPanel } from "./Judgement/Judgement";
import { createAuraUptimePanel } from "./AuraUptime/AuraUptime";
import { createMetricsPanel } from "./Metrics/Metrics";
import { PeriodsPanel } from "./PeriodsPanel/PeriodsPanel";
import { createPossessionPanel } from "./PossessionPanel/PossessionPanel";
import { createComparisonPanel } from "./ComparisonPanel/ComparisonPanel";
import { createTimelinePanel } from "./Timeline/Timeline";
import { createRotationsPanel } from "./Rotations/Rotations";
import { createUnitLookupPanel } from "./UnitLookup/UnitLookup";
import { createEquipmentPanel } from "./Equipment/Equipment";
import { createLootPanel } from "./LootPanel/LootPanel";
import { createLoggingMetadataPanel } from "./LoggingMetadata/LoggingMetadata";

import { createDispelsDonePanel, createDispelsReceivedPanel } from "./Dispel/Dispel";
import { createInterruptsPanel } from "./Interrupt/Interrupt";
import { createInterruptLogPanel } from "./Interrupt/InterruptLog";
import { createAbsorbedDamagePanel } from "./AbsorbedDamage/AbsorbedDamage";
import { createResistsPanel } from "./ResistsPanel/Resists";
import { createDispelLogPanel } from "./Dispel/DispelLog";
import { createGuildsPanel } from "./Guilds/Guilds";
import { createCompanionStatsPanel } from "./CompanionStats/CompanionStats";
import { createPullsAndCleanupPanel } from "./PullsAndCleanup/PullsAndCleanup";
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
  leaderboard: createLeaderboardPanel(),
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
  // Charts
  timeline: createTimelinePanel(),
  // Rotations
  rotations: createRotationsPanel(),
  // Possession timeline
  possession: createPossessionPanel(),
  // Unit lookup
  unit_lookup: createUnitLookupPanel(),
  equipment: createEquipmentPanel(),
  // Dispels
  dispels_done: createDispelsDonePanel(),
  dispels_received: createDispelsReceivedPanel(),
  dispel_log: createDispelLogPanel(),
  // Interrupts
  interrupts: createInterruptsPanel(),
  interrupt_log: createInterruptLogPanel(),
  loot: createLootPanel(),
  logging_metadata: createLoggingMetadataPanel(),
  absorbed_damage: createAbsorbedDamagePanel(),
  resists: createResistsPanel(),
  guilds: createGuildsPanel(),
  companion_stats: createCompanionStatsPanel(),
  pulls_and_cleanup: createPullsAndCleanupPanel(),
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

const PANEL_CLIPBOARD_KEY = "panel-clipboard";

const FILTER_TYPE_LABELS: Record<PanelFilterType, string> = {
  ability_name: "Ability Name",
  ability_id: "Ability ID",
  ability_school: "School",
  ability_hittype: "Hit Type",
  source_type: "Source",
  target_type: "Target",
  players: "Players",
  enemies: "Enemies",
  time_range: "Time Range",
  event_value: "Event Value",
  event_type: "Event Type",
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
  onEdit,
  onClose,
  hasCustomFilters,
}: {
  position: { x: number; y: number };
  onReset: () => void;
  onEdit: () => void;
  onClose: () => void;
  hasCustomFilters: boolean;
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
        onClick={onEdit}
      >
        Edit filters
      </button>
      {hasCustomFilters && (
        <button
          className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
          onClick={onReset}
        >
          Reset filters
        </button>
      )}
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

function extractGroupingFromTokens(tokens: string[]): string | null {
  const token = tokens.find((t) => t.startsWith("g:"));
  return token ? token.slice(2) : null;
}

function extractPetModeFromTokens(tokens: string[]): string | null {
  const token = tokens.find((t) => t.startsWith("p:"));
  return token ? token.slice(2) : null;
}

function buildTokensWithMeta(
  baseTokens: string[],
  borderColor: string | null,
  customTitle: string | null,
  grouping: string | null,
  petMode: string | null,
): string[] {
  const filtered = baseTokens.filter((t) => !t.startsWith("bc:") && !t.startsWith("t:") && !t.startsWith("g:") && !t.startsWith("p:"));
  if (borderColor) filtered.push(`bc:${borderColor}`);
  if (customTitle) filtered.push(`t:${customTitle}`);
  if (grouping) filtered.push(`g:${grouping}`);
  if (petMode) filtered.push(`p:${petMode}`);
  return filtered;
}

export interface EventsPanelProps {
  panelType: EventsPanelType;
  onPanelTypeChange: (type: EventsPanelType) => void;
  durationMs: number;
  context: PanelContext;
  /** Unique index for timing tracking (0-3 for 4 panels) */
  panelIndex: number;
  /** Stable layout item ID (e.g. "panel-1") */
  panelId?: string;
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
  panelId,
  onExplainerClick,
  showHints = true,
  panelOption,
  onPanelOptionChange,
  seedFilters,
  seedFiltersVersion,
  onFiltersChange,
}: EventsPanelProps) {
  const isMobile = useIsMobile();
  const rawPanel = PANELS[panelType];

  // Inject a default time_range controller filter for all panels that support filtering,
  // unless the panel already defines its own time_range default.
  const panel = useMemo(() => {
    if (!rawPanel.supportsFiltering) return rawPanel;
    const existing = rawPanel.defaultFilters ?? [];
    if (existing.some((f) => f.type === "time_range")) return rawPanel;
    return {
      ...rawPanel,
      defaultFilters: [...existing],
    };
  }, [rawPanel]);

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
  // Applied filters keep working during Sync (full-data panels still run them in
  // the worker); only editing is paused while playback drives the panels.
  const filteringSupported = panel.supportsFiltering === true && !isSyncActive;
  const fixedFilters = panel.fixedFilters ?? [];
  const userFilters = customFilters ?? [];

  const hasCustomFilters = filteringSupported && customFilters !== null &&
    JSON.stringify(customFilters) !== JSON.stringify(panel.defaultFilters ?? []);

  // Border color, custom title, grouping, and pet mode derived from panelOption tokens.
  // When no explicit token is set, fall back to the panel's first grouping/pet option
  // so the processor default matches the UI default.
  const borderColor = useMemo(() => extractBorderColorFromTokens(customToggleTokens), [customToggleTokens]);
  const customTitle = useMemo(() => extractCustomTitleFromTokens(customToggleTokens), [customToggleTokens]);
  const grouping = useMemo(() => extractGroupingFromTokens(customToggleTokens) ?? panel.groupingOptions?.[0]?.value ?? null, [customToggleTokens, panel.groupingOptions]);
  const petMode = useMemo(() => extractPetModeFromTokens(customToggleTokens) ?? panel.petOptions?.[0]?.value ?? null, [customToggleTokens, panel.petOptions]);

  const setBorderColor = useCallback((color: string | null) => {
    if (!onPanelOptionChange) return;
    const tokens = buildTokensWithMeta(customToggleTokens, color, customTitle, grouping, petMode);
    onPanelOptionChange(buildPanelOptionFromTokens(tokens));
  }, [customToggleTokens, customTitle, grouping, petMode, onPanelOptionChange]);

  const setCustomTitle = useCallback((title: string | null) => {
    if (!onPanelOptionChange) return;
    const tokens = buildTokensWithMeta(customToggleTokens, borderColor, title, grouping, petMode);
    onPanelOptionChange(buildPanelOptionFromTokens(tokens));
  }, [customToggleTokens, borderColor, grouping, petMode, onPanelOptionChange]);

  const setGrouping = useCallback((g: string | null) => {
    if (!onPanelOptionChange) return;
    const tokens = buildTokensWithMeta(customToggleTokens, borderColor, customTitle, g, petMode);
    onPanelOptionChange(buildPanelOptionFromTokens(tokens));
  }, [customToggleTokens, borderColor, customTitle, petMode, onPanelOptionChange]);

  const setPetMode = useCallback((p: string | null) => {
    if (!onPanelOptionChange) return;
    const tokens = buildTokensWithMeta(customToggleTokens, borderColor, customTitle, grouping, p);
    onPanelOptionChange(buildPanelOptionFromTokens(tokens));
  }, [customToggleTokens, borderColor, customTitle, grouping, onPanelOptionChange]);

  // Effective panelOption with grouping/pet defaults injected so the processor
  // sees the same defaults as the UI (first option in groupingOptions/petOptions).
  const effectivePanelOption = useMemo(() => {
    const tokens = [...customToggleTokens];
    if (grouping && !tokens.some((t) => t.startsWith("g:"))) tokens.push(`g:${grouping}`);
    if (petMode && !tokens.some((t) => t.startsWith("p:"))) tokens.push(`p:${petMode}`);
    return buildPanelOptionFromTokens(tokens);
  }, [customToggleTokens, grouping, petMode]);

  // -- ChartDataRegistry: register/unregister for cross-panel comparison ------
  const { register: chartRegister, unregister: chartUnregister } = useChartDataActions();

  const effectivePanelId = panelId ?? `panel-${panelIndex}`;

  const registerChartData = useCallback(
    (data: PlayerMetricChartData[]) => {
      chartRegister({
        panelId: effectivePanelId,
        panelIndex,
        panelType: panelType as EventsPanelType,
        label: customTitle || panel.label,
        borderColor,
        data,
      });
    },
    [chartRegister, effectivePanelId, panelIndex, panelType, customTitle, panel.label, borderColor],
  );

  // Unregister when panel unmounts or panel type changes
  useEffect(() => {
    return () => {
      chartUnregister(effectivePanelId);
    };
  }, [chartUnregister, effectivePanelId, panelType]);

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
    setBorderColor(null);
    setCustomTitle(null);
  }, [applyFilters, panel.defaultFilters, setBorderColor, setCustomTitle]);

  // Panel copy/paste via sessionStorage

  const handleCopyPanel = useCallback(() => {
    const data = {
      panelType,
      panelOption: panelOption ?? null,
      filters: userFilters,
    };
    const json = JSON.stringify(data);
    navigator.clipboard.writeText(json).then(() => {
      toast.success("Panel copied to clipboard");
    }).catch(() => {
      // Fallback to sessionStorage if clipboard access is denied
      sessionStorage.setItem(PANEL_CLIPBOARD_KEY, json);
    });
  }, [panelType, panelOption, userFilters]);

  const handlePastePanel = useCallback(async () => {
    let raw: string | null = null;
    try {
      raw = await navigator.clipboard.readText();
    } catch {
      // Fallback to sessionStorage if clipboard access is denied
      raw = sessionStorage.getItem(PANEL_CLIPBOARD_KEY);
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        panelType: EventsPanelType;
        panelOption: string | null;
        filters: PanelFilter[];
      };
      if (!parsed.panelType || !(parsed.panelType in PANELS)) return;
      onPanelTypeChange(parsed.panelType);
      onPanelOptionChange?.(parsed.panelOption);
      if (parsed.filters && parsed.filters.length > 0) {
        applyFilters(parsed.filters);
      } else {
        applyFilters(PANELS[parsed.panelType].defaultFilters ?? []);
      }
      setPendingFilters(null);
    } catch {
      // Ignore malformed clipboard data
    }
  }, [onPanelTypeChange, onPanelOptionChange, applyFilters]);

  const flipCard = useCallback(() => {
    setFlipped((prev) => {
      if (prev) {
        // Flipping back — apply buffered filters (only for standard panels;
        // panels with renderCardBack manage their own panelContext updates)
        if (!panel.renderCardBack && pendingFilters !== null) {
          applyFilters(pendingFilters);
          setPendingFilters(null);
        }
      } else {
        // Flipping open — seed buffer with current filters
        if (!panel.renderCardBack) {
          setPendingFilters(userFilters);
        }
      }
      return !prev;
    });
  }, [pendingFilters, applyFilters, userFilters, panel.renderCardBack]);

  const closeFilterEditor = useCallback(() => {
    if (!panel.renderCardBack && pendingFilters !== null) {
      applyFilters(pendingFilters);
      setPendingFilters(null);
    }
    setFlipped(false);
  }, [pendingFilters, applyFilters, panel.renderCardBack]);

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
      // Allow panels with hydrateContext to restore their own context from panelOption
      const hydrated = panel.hydrateContext && panelOption ? panel.hydrateContext(panelOption) : null;
      setPanelContext(hydrated);
    }
    setPanelContextVersion((version) => version + 1);
    setFlipped(false);
    setPendingFilters(null);
    // NOTE: We intentionally do NOT call onFiltersChange here. The parent owns
    // panelFiltersByID and sets default filters itself when the panel type changes.
    // Calling onFiltersChange from this effect would clobber saved filters that
    // the parent loaded from a layout book / shared view.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset on panelType change
  }, [panelType]);

  // Seed filters from shared layout / layout book. Only re-applies when the
  // parent bumps seedFiltersVersion (import / cast), NOT on every reference change.
  // Also re-hydrates panel context from panelOption (e.g. timeline series config).
  const appliedSeedVersion = useRef(-1);
  useEffect(() => {
    if (seedFiltersVersion == null || seedFiltersVersion === appliedSeedVersion.current) return;
    appliedSeedVersion.current = seedFiltersVersion;
    if (seedFilters && seedFilters.length > 0) {
      setPanelContext((prev) => ({ ...(prev ?? {}), filters: seedFilters }));
      setPanelContextVersion((v) => v + 1);
    }
    // Re-hydrate context from panelOption (e.g. preset layout changing timeline series)
    if (panel.hydrateContext && panelOption) {
      const hydrated = panel.hydrateContext(panelOption);
      if (hydrated) {
        setPanelContext((prev) => ({ ...(prev ?? {}), ...hydrated }));
        setPanelContextVersion((v) => v + 1);
      }
    }
  }, [seedFiltersVersion, seedFilters, panel, panelOption]);

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
    panelOption: effectivePanelOption,
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
    // Full-data panels aggregate the whole encounter even during Sync, so they
    // keep the full duration; elapsed time would skew their per-second values.
    if (
      syncMode?.enabled &&
      panel.syncDataMode !== "full" &&
      syncMode.currentTimestamp &&
      syncMode.encounterBounds
    ) {
      const elapsedMs =
        syncMode.currentTimestamp.getTime() - syncMode.encounterBounds.start.getTime();
      return Math.max(elapsedMs, 1);
    }

    return durationMs;
  }, [syncMode?.enabled, syncMode?.currentTimestamp, syncMode?.encounterBounds, durationMs, panel.syncDataMode]);

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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                      <EllipsisVertical className="h-3.5 w-3.5" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[120px]">
                    <DropdownMenuItem onClick={handleCopyPanel}>
                      <Copy className="h-3.5 w-3.5 mr-2" />
                      Copy
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePastePanel}>
                      <ClipboardPaste className="h-3.5 w-3.5 mr-2" />
                      Paste
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <HintTooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={hasCustomFilters ? "text-emerald-500 cursor-pointer" : "text-muted-foreground cursor-pointer"}
                      onClick={(e) => {
                        setFilterContextMenu({ x: e.clientX, y: e.clientY });
                      }}
                    >
                      <Filter className="h-3.5 w-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" hideArrow className="p-3 bg-card text-card-foreground border border-border">
                    {hasCustomFilters ? (
                      <FilterSummaryCard filters={customFilters ?? []} />
                    ) : (
                      <span className="text-xs text-muted-foreground">No custom filters</span>
                    )}
                  </TooltipContent>
                </HintTooltip>
                {filterContextMenu && (
                  <FilterContextMenu
                    position={filterContextMenu}
                    onReset={() => { resetFilters(); setFilterContextMenu(null); }}
                    onEdit={() => { flipCard(); setFilterContextMenu(null); }}
                    onClose={() => setFilterContextMenu(null)}
                    hasCustomFilters={hasCustomFilters}
                  />
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
                panelOption: effectivePanelOption,
                setPanelOption: onPanelOptionChange,
                panelContext,
                panelContextVersion: `${panelContextVersion}|${aggregationContextKey}`,
                setPanelContext: setPanelContextWithKey,
                panelIndex,
                panelId: effectivePanelId,
                registerChartData,
                hasCustomFilters,
              })}
            </div>
          </>
        )}
        back={panel.renderCardBack
          ? panel.renderCardBack({
              panelContext,
              setPanelContext: setPanelContextWithKey,
              onClose: closeFilterEditor,
              onReset: resetFilters,
              panelLabel: panel.label,
              panelIcon: panel.icon,
              borderColor,
              onBorderColorChange: onPanelOptionChange ? setBorderColor : undefined,
              customTitle,
              onCustomTitleChange: onPanelOptionChange ? setCustomTitle : undefined,
              panelOption: effectivePanelOption,
              setPanelOption: onPanelOptionChange ?? undefined,
            })
          : (
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
            groupingOptions={panel.groupingOptions}
            grouping={grouping}
            onGroupingChange={onPanelOptionChange ? setGrouping : undefined}
            petOptions={panel.petOptions}
            petMode={petMode}
            onPetModeChange={onPanelOptionChange ? setPetMode : undefined}
          />
        )}
      />
    </BreakoutHoverProvider>
  );
}
