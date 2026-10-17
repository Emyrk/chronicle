import { useMemo } from "react";
import type { UnitResourcesProcessorEvent } from "../processorTypes";
import type { PanelContext, PanelDefinition } from "../types";
import { usePanelAggregation } from "../usePanelAggregation";
import {
  actualRaidHealthProcessor,
  type ActualRaidHealthResult,
} from "./actualRaidHealth.processor";
import {
  createActualStatusRaidHealthModel,
  type StatusRaidHealthModel,
} from "./statusRaidHealth";

const ACTUAL_RAID_HEALTH_PANEL: PanelDefinition<ActualRaidHealthResult, UnitResourcesProcessorEvent> = {
  ...actualRaidHealthProcessor,
  label: "Actual Raid Durability",
  icon: null,
  keybinds: [],
  syncDataMode: "full",
  render: () => null,
};

export interface ActualRaidDurabilityModelResult {
  model: StatusRaidHealthModel;
  supported: boolean;
  available: boolean;
}

export function useActualRaidDurabilityModel(
  context: PanelContext,
  encounterId: string | null,
  enabled = true,
): ActualRaidDurabilityModelResult {
  const supported = context.instance.capabilities?.includes("unit-resources") ?? false;
  const aggregation = usePanelAggregation<ActualRaidHealthResult>({
    panel: ACTUAL_RAID_HEALTH_PANEL,
    context,
    enabled: enabled && supported && encounterId !== null,
  });
  const encounter = encounterId ? aggregation.result.encounters.get(encounterId) ?? null : null;
  const model = useMemo(
    () => createActualStatusRaidHealthModel(encounter?.resourcesByUnit ?? new Map()),
    [encounter],
  );

  return {
    model,
    supported,
    available: model.unitCount > 0,
  };
}
