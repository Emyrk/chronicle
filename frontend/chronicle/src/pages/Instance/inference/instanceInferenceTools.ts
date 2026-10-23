import type { ChartDataEntry } from "../EventsPanels/ChartDataRegistry";
import type { PanelFilter } from "../EventsPanels/processors/filters";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";

const QUERYABLE_METRIC_PANELS = new Set([
  "damage_done",
  "damage_taken",
  "healing_done",
  "healing_taken",
]);

export interface InstanceUITimeRange {
  enabled: boolean;
  startOffsetMs: number | null;
  endOffsetMs: number | null;
}

export interface InstanceUIState {
  revision: number;
  instanceId: string;
  instanceName: string;
  selectedEncounterIds: string[];
  selectedPlayerIds: string[];
  selectedEnemyIds: string[];
  includeWipes: boolean;
  timeRange: InstanceUITimeRange;
  presetId: string | null;
  layoutItems: GridEditorItem[];
  panelTypesById: Record<string, string>;
  panelOptionsById: Record<string, string | null>;
  panelFiltersById: Record<string, PanelFilter[]>;
  availableEncounterIds: string[];
  availablePlayerIds: string[];
  availableEnemyIds: string[];
  availablePanelTypes: string[];
  availablePresets: string[];
}

export type InstanceUISnapshotSection = "selection" | "layout" | "panels" | "capabilities";

export interface InspectInstanceUIArguments {
  include?: InstanceUISnapshotSection[];
}

function uniqueSections(include: InstanceUISnapshotSection[] | undefined): Set<InstanceUISnapshotSection> {
  if (!include || include.length === 0) {
    return new Set(["selection", "layout", "panels", "capabilities"]);
  }
  return new Set(include.slice(0, 4));
}

export function buildInstanceUISnapshot(
  state: InstanceUIState,
  include?: InstanceUISnapshotSection[],
): Record<string, unknown> {
  const sections = uniqueSections(include);
  const snapshot: Record<string, unknown> = {
    schemaVersion: 1,
    revision: state.revision,
    instance: { id: state.instanceId, name: state.instanceName },
  };
  if (sections.has("selection")) {
    snapshot.selection = {
      encounterIds: state.selectedEncounterIds,
      playerIds: state.selectedPlayerIds,
      enemyIds: state.selectedEnemyIds,
      includeWipes: state.includeWipes,
      timeRange: state.timeRange,
    };
  }
  if (sections.has("layout")) {
    snapshot.layout = { presetId: state.presetId, items: state.layoutItems };
  }
  if (sections.has("panels")) {
    snapshot.panels = state.layoutItems
      .filter((item) => item.kind !== "group")
      .map((item) => {
        const panelType = state.panelTypesById[item.id] ?? "empty";
        return {
          id: item.id,
          type: panelType,
          option: state.panelOptionsById[item.id] ?? null,
          filters: state.panelFiltersById[item.id] ?? [],
          queryable: QUERYABLE_METRIC_PANELS.has(panelType),
        };
      });
  }
  if (sections.has("capabilities")) {
    snapshot.capabilities = {
      panelTypes: state.availablePanelTypes,
      presets: state.availablePresets,
    };
  }
  return snapshot;
}

export interface QueryMetricPanelArguments {
  panel_id: string;
  view?: "summary" | "top_entities";
  limit?: number;
}

export function queryMetricPanel(
  entries: ReadonlyMap<string, ChartDataEntry>,
  args: QueryMetricPanelArguments,
): Record<string, unknown> {
  const entry = entries.get(args.panel_id);
  if (!entry) throw new Error("panel_not_ready");
  if (!QUERYABLE_METRIC_PANELS.has(entry.panelType)) throw new Error("panel_not_queryable");
  const limit = Math.min(50, Math.max(1, Math.trunc(args.limit ?? 10)));
  const rows = [...entry.data]
    .sort((left, right) => right.value - left.value || left.playerID.localeCompare(right.playerID));
  return {
    panelId: entry.panelId,
    panelType: entry.panelType,
    label: entry.label,
    view: args.view ?? "top_entities",
    truncated: rows.length > limit,
    totalRows: rows.length,
    rows: rows.slice(0, limit).map((row) => ({
      entityId: row.playerID,
      name: row.playerName,
      className: row.className,
      specialization: row.specialization,
      value: row.value,
      ...(row.stackedValue === undefined ? {} : { secondaryValue: row.stackedValue }),
    })),
  };
}

export type InstanceUIOperation =
  | { op: "apply_preset"; preset_id: string }
  | { op: "set_panel"; panel_id: string; panel_type: string }
  | { op: "set_panel_option"; panel_id: string; option: string | null }
  | { op: "set_panel_filters"; panel_id: string; filters: PanelFilter[] }
  | { op: "select_encounters" | "select_players" | "select_enemies"; ids: string[] }
  | { op: "set_time_range"; start_offset_ms: number; end_offset_ms: number }
  | { op: "clear_time_range" };

export interface UpdateInstanceUIArguments {
  expected_revision?: number;
  operations: InstanceUIOperation[];
}

export interface InstanceUIUpdatePlan {
  expectedRevision: number;
  operations: InstanceUIOperation[];
  summaries: string[];
}

function title(value: string): string {
  return value.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
}

function requirePanel(state: InstanceUIState, panelId: string): void {
  if (!state.layoutItems.some((item) => item.id === panelId && item.kind !== "group")) {
    throw new Error("unknown_panel");
  }
}

function requireKnownIds(ids: string[], availableIds: string[]): void {
  const available = new Set(availableIds);
  if (ids.some((id) => !available.has(id))) throw new Error("invalid_selection");
}

function validateOperation(state: InstanceUIState, operation: InstanceUIOperation): string {
  switch (operation.op) {
    case "apply_preset":
      if (!state.availablePresets.includes(operation.preset_id)) throw new Error("unknown_preset");
      return `Apply ${title(operation.preset_id)} preset`;
    case "set_panel":
      requirePanel(state, operation.panel_id);
      if (!state.availablePanelTypes.includes(operation.panel_type)) throw new Error("unknown_panel_type");
      return `Change panel ${operation.panel_id} to ${title(operation.panel_type)}`;
    case "set_panel_option":
      requirePanel(state, operation.panel_id);
      if (operation.option !== null && operation.option.length > 1000) throw new Error("invalid_panel_option");
      return `Update options for panel ${operation.panel_id}`;
    case "set_panel_filters":
      requirePanel(state, operation.panel_id);
      if (!Array.isArray(operation.filters) || operation.filters.length > 20) throw new Error("invalid_panel_filters");
      return `Apply ${operation.filters.length} filter${operation.filters.length === 1 ? "" : "s"} to panel ${operation.panel_id}`;
    case "select_encounters":
      if (!Array.isArray(operation.ids) || operation.ids.length === 0 || operation.ids.length > 100) throw new Error("invalid_selection");
      requireKnownIds(operation.ids, state.availableEncounterIds);
      return `Select ${operation.ids.length} encounter${operation.ids.length === 1 ? "" : "s"}`;
    case "select_players":
      if (!Array.isArray(operation.ids) || operation.ids.length > 100) throw new Error("invalid_selection");
      requireKnownIds(operation.ids, state.availablePlayerIds);
      return `Select ${operation.ids.length} player${operation.ids.length === 1 ? "" : "s"}`;
    case "select_enemies":
      if (!Array.isArray(operation.ids) || operation.ids.length > 100) throw new Error("invalid_selection");
      requireKnownIds(operation.ids, state.availableEnemyIds);
      return `Select ${operation.ids.length} enem${operation.ids.length === 1 ? "y" : "ies"}`;
    case "set_time_range":
      if (!Number.isFinite(operation.start_offset_ms) || !Number.isFinite(operation.end_offset_ms)
        || operation.start_offset_ms < 0 || operation.end_offset_ms <= operation.start_offset_ms) {
        throw new Error("invalid_time_range");
      }
      return `Set time range to ${operation.start_offset_ms}–${operation.end_offset_ms} ms`;
    case "clear_time_range":
      return "Clear time range";
  }
}

export function planInstanceUIUpdate(
  state: InstanceUIState,
  args: UpdateInstanceUIArguments,
): InstanceUIUpdatePlan {
  if (args.expected_revision !== undefined && args.expected_revision !== state.revision) {
    throw new Error("stale_state");
  }
  if (!Array.isArray(args.operations) || args.operations.length === 0 || args.operations.length > 20) {
    throw new Error("invalid_operations");
  }
  return {
    expectedRevision: state.revision,
    operations: args.operations,
    summaries: args.operations.map((operation) => validateOperation(state, operation)),
  };
}
