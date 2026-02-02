/**
 * EventsPanel - Container component for event aggregation panels
 */

import { useState } from "react";
import { Card } from "@/components/ui/Card/Card";
import { BreakoutHoverProvider } from "@/components/ui/AbilityBreakout";
import { Switch } from "@/components/ui/Switch/Switch";
import { usePanelAggregation } from "./usePanelAggregation";
import { usePanelTiming } from "./PanelTimingContext";
import type { PanelDefinition, PanelContext } from "./types";
import { PanelSelector } from "./PanelSelector";

// Import panel definitions
import { createDamageDonePanel } from "./DamageDone/DamageDone";
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
import { createSunderPanel } from "./Warrior/Sunder";
// TODO: Avoidance panel requires spell school data which isn't available yet
// import { createAvoidancePanel } from "./Avoidance/Avoidance";

// Registry of all available panels
// Using `any` here to allow different result types per panel.
// Type safety is maintained within each panel definition.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PANELS: Record<string, PanelDefinition<any, any>> = {
  damage_done: createDamageDonePanel("players"),
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
};

export type EventsPanelType = keyof typeof PANELS;

export interface EventsPanelProps {
  panelType: EventsPanelType;
  onPanelTypeChange: (type: EventsPanelType) => void;
  durationMs: number;
  context: PanelContext;
  /** Unique index for timing tracking (0-3 for 4 panels) */
  panelIndex: number;
}

export function EventsPanel({
  panelType,
  onPanelTypeChange,
  durationMs,
  context,
  panelIndex,
}: EventsPanelProps) {
  const [checkboxChecked, setCheckboxChecked] = useState(false);
  const panel = PANELS[panelType];
  
  // Determine if checkbox should be shown and its label
  const showCheckbox = panel.supportsPerSecond || panel.checkboxLabel;
  const checkboxLabel = panel.checkboxLabel || "Per second";

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
    enabled: !panel.selfManagesAggregation,
  });
  
  // Report timing when panel finishes loading
  // For self-managed panels, we can't track timing this way (they manage their own)
  const isDone = panel.selfManagesAggregation || processingTimeMs !== null;
  usePanelTiming(`panel-${panelIndex}`, isDone);

  return (
    <BreakoutHoverProvider>
      <Card className="p-4 gap-2 mb-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <PanelSelector value={panelType} onChange={onPanelTypeChange} />
          </h3>
          {showCheckbox && (
            <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground pr-2">
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
        {panel.render({
          result,
          totalEvents,
          processingTimeMs,
          durationMs,
          perSecond: checkboxChecked,
          checkboxChecked,
          loading,
          processing,
          error,
          context,
        })}
      </Card>
    </BreakoutHoverProvider>
  );
}
