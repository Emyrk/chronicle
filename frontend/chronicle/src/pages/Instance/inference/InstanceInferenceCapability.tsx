import { useInferenceCapability } from "@/features/chat";
import type { PanelFilter } from "../EventsPanels/processors/filters";
import { useChartDataEntries } from "../EventsPanels/ChartDataRegistry";
import {
  buildInstanceUISnapshot,
  planInstanceUIUpdate,
  queryMetricPanel,
  type InspectInstanceUIArguments,
  type InstanceUIOperation,
  type InstanceUIState,
  type QueryMetricPanelArguments,
  type UpdateInstanceUIArguments,
} from "./instanceInferenceTools";

interface InstanceInferenceCapabilityProps {
  state: InstanceUIState;
  canMutate: boolean;
  onApplyPreset: (presetId: string) => void;
  onSetPanel: (panelId: string, panelType: string) => void;
  onSetPanelOption: (panelId: string, option: string | null) => void;
  onSetPanelFilters: (panelId: string, filters: PanelFilter[]) => void;
  onSelectEncounters: (ids: string[]) => void;
  onSelectPlayers: (ids: string[]) => void;
  onSelectEnemies: (ids: string[]) => void;
  onSetTimeRange: (startOffsetMs: number, endOffsetMs: number) => void;
  onClearTimeRange: () => void;
}

export function InstanceInferenceCapability({
  state,
  canMutate,
  onApplyPreset,
  onSetPanel,
  onSetPanelOption,
  onSetPanelFilters,
  onSelectEncounters,
  onSelectPlayers,
  onSelectEnemies,
  onSetTimeRange,
  onClearTimeRange,
}: InstanceInferenceCapabilityProps) {
  const chartDataEntries = useChartDataEntries();

  const applyOperation = (operation: InstanceUIOperation) => {
    switch (operation.op) {
      case "apply_preset":
        onApplyPreset(operation.preset_id);
        break;
      case "set_panel":
        onSetPanel(operation.panel_id, operation.panel_type);
        break;
      case "set_panel_option":
        onSetPanelOption(operation.panel_id, operation.option);
        break;
      case "set_panel_filters":
        onSetPanelFilters(operation.panel_id, operation.filters);
        break;
      case "select_encounters":
        onSelectEncounters(operation.ids);
        break;
      case "select_players":
        onSelectPlayers(operation.ids);
        break;
      case "select_enemies":
        onSelectEnemies(operation.ids);
        break;
      case "set_time_range":
        onSetTimeRange(operation.start_offset_ms, operation.end_offset_ms);
        break;
      case "clear_time_range":
        onClearTimeRange();
        break;
    }
  };

  useInferenceCapability({
    id: "instance-page",
    version: 1,
    scope: { type: "instance", id: state.instanceId },
    stateRevision: state.revision,
    tools: {
      inspect_instance_ui: (argumentsValue) => {
        const args = argumentsValue as InspectInstanceUIArguments;
        return buildInstanceUISnapshot(state, args.include);
      },
      query_panel: (argumentsValue) => queryMetricPanel(
        chartDataEntries,
        argumentsValue as QueryMetricPanelArguments,
      ),
      update_instance_ui: (argumentsValue) => {
        if (!canMutate) {
          throw new Error("capability_unavailable: This instance view is read-only while following a live session.");
        }
        const plan = planInstanceUIUpdate(state, argumentsValue as UpdateInstanceUIArguments);
        for (const operation of plan.operations) applyOperation(operation);
        return {
          applied: true,
          previousRevision: plan.expectedRevision,
          operations: plan.summaries,
        };
      },
    },
  });

  return null;
}
