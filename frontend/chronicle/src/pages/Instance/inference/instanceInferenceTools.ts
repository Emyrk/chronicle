import type { ChartDataEntry } from "../EventsPanels/ChartDataRegistry";
import type { PanelFilter } from "../EventsPanels/processors/filters";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import { layoutDraftToExport, normalizeLayoutDraftItems, removeItem, type LayoutDraft } from "@/features/layoutEditor/layoutDraft";
import type { LayoutAppearance, LayoutLabExportV1 } from "@/features/layoutBook/parseLayout";
import type { EventsPanelType } from "../EventsPanels";
import { resolveStripSize, type StripSizeProfile, type StripType } from "../EventsPanels/Strips/types";
import { isQueryablePanelType } from "../EventsPanels/panelCatalog";

export interface InstanceUITimeRange {
  enabled: boolean;
  startOffsetMs: number | null;
  endOffsetMs: number | null;
}

export interface InstanceUIPanelCatalogEntry {
  id: string;
  label: string;
  description: string;
  queryable: boolean;
  hidden: boolean;
}

export interface InstanceUIStripCatalogEntry {
  id: string;
  label: string;
  defaultOrientation: "horizontal" | "vertical";
  supportedOrientations: Array<"horizontal" | "vertical">;
  size: StripSizeProfile;
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
  layoutAppearance: LayoutAppearance;
  layoutItems: GridEditorItem[];
  panelTypesById: Record<string, string>;
  panelOptionsById: Record<string, string | null>;
  panelFiltersById: Record<string, PanelFilter[]>;
  availableEncounterIds: string[];
  availablePlayerIds: string[];
  availableEnemyIds: string[];
  availablePanelCatalog: InstanceUIPanelCatalogEntry[];
  availablePanelTypes: string[];
  availableStripCatalog: InstanceUIStripCatalogEntry[];
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
    snapshot.layout = { presetId: state.presetId, appearance: state.layoutAppearance, items: state.layoutItems };
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
          queryable: isQueryablePanelType(panelType),
        };
      });
  }
  if (sections.has("capabilities")) {
    snapshot.capabilities = {
      panelTypes: state.availablePanelTypes,
      panelCatalog: state.availablePanelCatalog,
      stripCatalog: state.availableStripCatalog,
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
  if (!isQueryablePanelType(entry.panelType)) throw new Error("panel_not_queryable");
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

const LAYOUT_COLUMNS = 12;
const MAX_LAYOUT_OPERATIONS = 20;
const MAX_LAYOUT_ITEMS = 24;
const ITEM_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export type InstanceLayoutOperation =
  | { op: "add_panel"; item_id: string; panel_type: string; x: number; y: number; w: number; h: number }
  | { op: "add_strip"; item_id: string; strip_type: string; orientation?: "horizontal" | "vertical"; x: number; y: number; w?: number; h?: number }
  | { op: "remove_item"; item_id: string }
  | { op: "move_item"; item_id: string; x: number; y: number }
  | { op: "resize_item"; item_id: string; w: number; h: number }
  | { op: "add_group"; item_id: string; title: string; x: number; y: number; description?: string; accent_color?: string; collapsed_by_default?: boolean }
  | { op: "update_group"; item_id: string; title?: string; description?: string; accent_color?: string | null; collapsed_by_default?: boolean }
  | { op: "move_into_group"; item_id: string; group_id: string; x: number; y: number }
  | { op: "move_out_of_group"; item_id: string; x: number; y: number }
  | { op: "set_appearance"; seamless: boolean };

export interface UpdateInstanceLayoutArguments {
  expected_revision?: number;
  operations: InstanceLayoutOperation[];
}

export interface InstanceLayoutUpdatePlan {
  expectedRevision: number;
  layout: LayoutLabExportV1;
  summaries: string[];
}

function requireItem(draft: LayoutDraft, itemId: string): GridEditorItem {
  const item = draft.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new Error("unknown_layout_item");
  return item;
}

function requireItemID(itemId: string): void {
  if (!ITEM_ID_PATTERN.test(itemId)) throw new Error("invalid_item_id");
}

function requireText(value: string | undefined, maximum: number, allowEmpty = false): void {
  if (value === undefined) return;
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "") || value.length > maximum) {
    throw new Error("invalid_layout_text");
  }
}

function requireCoordinate(value: number): void {
  if (!Number.isInteger(value) || value < 0) throw new Error("invalid_layout_geometry");
}

function requireWidth(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > LAYOUT_COLUMNS) throw new Error("invalid_layout_geometry");
}

function requireHeight(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 100) throw new Error("invalid_layout_geometry");
}

function patchItem(draft: LayoutDraft, itemId: string, patch: Partial<GridEditorItem>): LayoutDraft {
  return {
    ...draft,
    items: draft.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
  };
}

function applyLayoutOperation(
  state: InstanceUIState,
  draft: LayoutDraft,
  operation: InstanceLayoutOperation,
): { draft: LayoutDraft; summary: string } {
  switch (operation.op) {
    case "add_panel": {
      requireItemID(operation.item_id);
      if (draft.items.some((item) => item.id === operation.item_id)) throw new Error("duplicate_layout_item");
      if (!state.availablePanelTypes.includes(operation.panel_type)) throw new Error("unknown_panel_type");
      requireCoordinate(operation.x);
      requireCoordinate(operation.y);
      requireWidth(operation.w);
      requireHeight(operation.h);
      const title = state.availablePanelCatalog.find((entry) => entry.id === operation.panel_type)?.label ?? titleCase(operation.panel_type);
      return {
        draft: {
          ...draft,
          items: [...draft.items, {
            id: operation.item_id,
            kind: "panel",
            title,
            x: operation.x,
            y: operation.y,
            w: operation.w,
            h: operation.h,
            minW: 4,
            minH: 4,
          }],
          panelTypesById: { ...draft.panelTypesById, [operation.item_id]: operation.panel_type as EventsPanelType },
          panelOptionsById: { ...draft.panelOptionsById, [operation.item_id]: null },
        },
        summary: `Add ${title} panel ${operation.item_id}`,
      };
    }
    case "add_strip": {
      requireItemID(operation.item_id);
      if (draft.items.some((item) => item.id === operation.item_id)) throw new Error("duplicate_layout_item");
      const strip = state.availableStripCatalog.find((entry) => entry.id === operation.strip_type);
      if (!strip) throw new Error("unknown_strip_type");
      const orientation = operation.orientation ?? strip.defaultOrientation;
      if (!strip.supportedOrientations.includes(orientation)) throw new Error("unsupported_strip_orientation");
      const size = resolveStripSize(strip.size, orientation);
      const w = operation.w ?? size.preferredW;
      const h = operation.h ?? size.preferredH;
      requireCoordinate(operation.x);
      requireCoordinate(operation.y);
      requireWidth(w);
      requireHeight(h);
      if (w < size.minW || h < size.minH || (size.maxW !== undefined && w > size.maxW) || (size.maxH !== undefined && h > size.maxH)) {
        throw new Error("invalid_strip_geometry");
      }
      return {
        draft: {
          ...draft,
          items: [...draft.items, {
            id: operation.item_id,
            kind: "strip",
            stripType: operation.strip_type as StripType,
            orientation,
            title: strip.label,
            x: operation.x,
            y: operation.y,
            w,
            h,
            minW: size.minW,
            minH: size.minH,
            maxW: size.maxW,
            maxH: size.maxH,
          }],
        },
        summary: `Add ${strip.label} strip ${operation.item_id}`,
      };
    }
    case "remove_item": {
      const item = requireItem(draft, operation.item_id);
      return { draft: removeItem(draft, operation.item_id), summary: `Remove ${item.kind ?? "panel"} ${operation.item_id}` };
    }
    case "move_item": {
      requireItem(draft, operation.item_id);
      requireCoordinate(operation.x);
      requireCoordinate(operation.y);
      return { draft: patchItem(draft, operation.item_id, { x: operation.x, y: operation.y }), summary: `Move item ${operation.item_id}` };
    }
    case "resize_item": {
      const item = requireItem(draft, operation.item_id);
      if (item.kind === "group") throw new Error("invalid_group_geometry");
      requireWidth(operation.w);
      requireHeight(operation.h);
      return { draft: patchItem(draft, operation.item_id, { w: operation.w, h: operation.h }), summary: `Resize item ${operation.item_id}` };
    }
    case "add_group": {
      requireItemID(operation.item_id);
      if (draft.items.some((item) => item.id === operation.item_id)) throw new Error("duplicate_layout_item");
      requireCoordinate(operation.x);
      requireCoordinate(operation.y);
      if (operation.x !== 0) throw new Error("invalid_group_geometry");
      requireText(operation.title, 100);
      requireText(operation.description, 500, true);
      requireText(operation.accent_color, 100, true);
      return {
        draft: {
          ...draft,
          items: [...draft.items, {
            id: operation.item_id,
            kind: "group",
            title: operation.title.trim(),
            description: operation.description,
            accentColor: operation.accent_color,
            collapsedByDefault: operation.collapsed_by_default,
            x: 0,
            y: operation.y,
            w: LAYOUT_COLUMNS,
            h: 4,
            minW: LAYOUT_COLUMNS,
            maxW: LAYOUT_COLUMNS,
            minH: 4,
            maxH: 4,
          }],
        },
        summary: `Add group ${operation.title.trim()}`,
      };
    }
    case "update_group": {
      const group = requireItem(draft, operation.item_id);
      if (group.kind !== "group") throw new Error("not_a_group");
      if (operation.title === undefined && operation.description === undefined && operation.accent_color === undefined && operation.collapsed_by_default === undefined) {
        throw new Error("invalid_group_update");
      }
      requireText(operation.title, 100);
      requireText(operation.description, 500, true);
      requireText(operation.accent_color ?? undefined, 100, true);
      return {
        draft: patchItem(draft, operation.item_id, {
          ...(operation.title === undefined ? {} : { title: operation.title.trim() }),
          ...(operation.description === undefined ? {} : { description: operation.description }),
          ...(operation.accent_color === undefined ? {} : { accentColor: operation.accent_color ?? undefined }),
          ...(operation.collapsed_by_default === undefined ? {} : { collapsedByDefault: operation.collapsed_by_default }),
        }),
        summary: `Update group ${operation.item_id}`,
      };
    }
    case "move_into_group": {
      const item = requireItem(draft, operation.item_id);
      const group = requireItem(draft, operation.group_id);
      if (item.kind === "group" || group.kind !== "group" || operation.item_id === operation.group_id) throw new Error("invalid_group_membership");
      requireCoordinate(operation.x);
      requireCoordinate(operation.y);
      return {
        draft: patchItem(draft, operation.item_id, { groupId: operation.group_id, x: operation.x, y: operation.y }),
        summary: `Move item ${operation.item_id} into group ${operation.group_id}`,
      };
    }
    case "move_out_of_group": {
      const item = requireItem(draft, operation.item_id);
      if (item.kind === "group" || !item.groupId) throw new Error("invalid_group_membership");
      requireCoordinate(operation.x);
      requireCoordinate(operation.y);
      return {
        draft: patchItem(draft, operation.item_id, { groupId: undefined, x: operation.x, y: operation.y }),
        summary: `Move item ${operation.item_id} out of its group`,
      };
    }
    case "set_appearance":
      return {
        draft: { ...draft, appearance: { ...draft.appearance, seamless: operation.seamless } },
        summary: `${operation.seamless ? "Enable" : "Disable"} seamless layout`,
      };
  }
}

function itemsOverlap(left: GridEditorItem, right: GridEditorItem): boolean {
  return left.x < right.x + right.w
    && left.x + left.w > right.x
    && left.y < right.y + right.h
    && left.y + left.h > right.y;
}

function validateFinalLayout(layout: LayoutLabExportV1): void {
  if (layout.items.length > MAX_LAYOUT_ITEMS) throw new Error("too_many_layout_items");
  const ids = new Set<string>();
  const groupIds = new Set(layout.items.filter((item) => item.kind === "group").map((item) => item.id));
  let panelCount = 0;
  for (const item of layout.items) {
    requireItemID(item.id);
    if (ids.has(item.id)) throw new Error("duplicate_layout_item");
    ids.add(item.id);
    requireCoordinate(item.x);
    requireCoordinate(item.y);
    requireWidth(item.w);
    requireHeight(item.h);
    if (item.x + item.w > LAYOUT_COLUMNS) throw new Error("invalid_layout_geometry");
    if (item.minW !== undefined && item.w < item.minW) throw new Error("invalid_layout_geometry");
    if (item.minH !== undefined && item.h < item.minH) throw new Error("invalid_layout_geometry");
    if (item.maxW !== undefined && item.w > item.maxW) throw new Error("invalid_layout_geometry");
    if (item.maxH !== undefined && item.h > item.maxH) throw new Error("invalid_layout_geometry");
    if (item.kind === "group") {
      if (item.groupId || item.x !== 0 || item.w !== LAYOUT_COLUMNS) throw new Error("invalid_group_geometry");
    } else {
      panelCount += 1;
      if (item.groupId && !groupIds.has(item.groupId)) throw new Error("invalid_group_membership");
    }
  }
  if (panelCount > 8) throw new Error("too_many_panels");

  const scopes = new Map<string, GridEditorItem[]>();
  for (const item of layout.items) {
    const scope = item.groupId ?? "outer";
    const scoped = scopes.get(scope) ?? [];
    if (scoped.some((other) => itemsOverlap(item, other))) throw new Error("overlapping_layout_items");
    scoped.push(item);
    scopes.set(scope, scoped);
  }
}

export function planInstanceLayoutUpdate(
  state: InstanceUIState,
  args: UpdateInstanceLayoutArguments,
): InstanceLayoutUpdatePlan {
  if (args.expected_revision !== undefined && args.expected_revision !== state.revision) throw new Error("stale_state");
  if (!Array.isArray(args.operations) || args.operations.length === 0 || args.operations.length > MAX_LAYOUT_OPERATIONS) {
    throw new Error("invalid_operations");
  }
  let draft: LayoutDraft = {
    items: state.layoutItems.map((item) => ({ ...item })),
    panelTypesById: { ...state.panelTypesById } as Record<string, EventsPanelType>,
    panelOptionsById: { ...state.panelOptionsById },
    panelFiltersById: Object.fromEntries(Object.entries(state.panelFiltersById).map(([id, filters]) => [id, [...filters]])),
    appearance: { ...state.layoutAppearance },
  };
  const summaries: string[] = [];
  for (const operation of args.operations) {
    const result = applyLayoutOperation(state, draft, operation);
    draft = result.draft;
    summaries.push(result.summary);
  }
  validateFinalLayout(layoutDraftToExport(draft));
  const layout = layoutDraftToExport({ ...draft, items: normalizeLayoutDraftItems(draft.items) });
  validateFinalLayout(layout);
  return { expectedRevision: state.revision, layout, summaries };
}

function titleCase(value: string): string {
  return value.split("_").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
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
