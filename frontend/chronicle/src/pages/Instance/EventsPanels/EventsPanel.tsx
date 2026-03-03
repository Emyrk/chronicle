/**
 * EventsPanel - Container component for event aggregation panels
 */

import { useEffect, useMemo, useState } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { HelpCircle, Construction } from "lucide-react";
import { Card } from "@/components/ui/Card/Card";
import { Button } from "@/components/ui/button";
import { BreakoutHoverProvider } from "@/components/ui/AbilityBreakout";
import { Switch } from "@/components/ui/Switch/Switch";
import { HintTooltip, TooltipTrigger, TooltipContent } from "@/components/ui/Tooltip/tooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { cn } from "@/lib/utils";
import { usePanelAggregation } from "./usePanelAggregation";
import { usePanelTiming } from "./PanelTimingContext";
import { useSyncModeContextOptional } from "../SyncModeContext";
import type { PanelDefinition, PanelContext } from "./types";
import { PanelSelector } from "./PanelSelector";
import { hasExplainer } from "./explainers";

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
import { PeriodsPanel } from "./PeriodsPanel/PeriodsPanel";
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
  periods: PeriodsPanel,
};

export type EventsPanelType = keyof typeof PANELS;

/**
 * Get localStorage key for a panel's toggle state.
 * Each panel type has its own independent toggle state.
 */
function getToggleStorageKey(panelType: string): string {
  return `panel-toggle:${panelType}`;
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
}: EventsPanelProps) {
  const isMobile = useIsMobile();
  const panel = PANELS[panelType];

  // Determine checkbox label first (needed for storage key)
  const checkboxLabel = panel.checkboxLabel || "Per second";
  const showCheckbox = panel.supportsPerSecond || panel.checkboxLabel;
  
  // Persist toggle state to localStorage per panel type
  const [checkboxChecked, setCheckboxChecked] = useLocalStorage(
    getToggleStorageKey(panelType),
    false
  );
  
  // Panel-scoped context for processor/render options (e.g., vulnerability school mask).
  const [panelContext, setPanelContext] = useState<Record<string, unknown> | null>(null);

  // Reset panel context when panel type changes to avoid leaking options across panel types.
  useEffect(() => {
    setPanelContext(null);
  }, [panelType]);

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
  } = usePanelAggregation({
    panel,
    context,
    panelOption,
    panelContext,
    enabled: !panel.selfManagesAggregation,
  });
  
  // Report timing when panel finishes loading
  // For self-managed panels, we can't track timing this way (they manage their own)
  const isDone = panel.selfManagesAggregation || processingTimeMs !== null;
  usePanelTiming(`panel-${panelIndex}`, isDone);

  const syncMode = useSyncModeContextOptional();
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
      <Card
        className={cn(
          "p-4 gap-2 h-full mb-0 flex flex-col",
          panel.underConstruction && "border-yellow-500/50",
        )}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <PanelSelector value={panelType} onChange={onPanelTypeChange} />
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
                <TooltipContent side="top">
                  Learn about this panel
                </TooltipContent>
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

        {/* Render the panel content */}
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
            setPanelContext,
          })}
        </div>
      </Card>
    </BreakoutHoverProvider>
  );
}
