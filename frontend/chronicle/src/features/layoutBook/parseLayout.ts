import type { UserPanelLayout } from "@/api/queries";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { EventsPanelType } from "@/pages/Instance/EventsPanels";
import type { PanelFilter } from "@/pages/Instance/EventsPanels/processors/filters";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
} from "@/pages/Instance/viewDefaults";

export interface LayoutLabExportV1 {
  version: 1;
  items: GridEditorItem[];
  panelTypesById: Record<string, EventsPanelType>;
  panelOptionsById?: Record<string, string>;
  panelFiltersById?: Record<string, PanelFilter[]>;
}

export function serializeLayoutLab(
  items: GridEditorItem[],
  panelTypesById: Record<string, EventsPanelType>,
  panelOptionsById?: Record<string, string | null>,
  panelFiltersById?: Record<string, PanelFilter[]>,
): string {
  const filteredPanelOptions = panelOptionsById
    ? Object.fromEntries(Object.entries(panelOptionsById).filter(([, value]) => value !== null)) as Record<string, string>
    : undefined;

  const filteredPanelFilters = panelFiltersById
    ? Object.fromEntries(Object.entries(panelFiltersById).filter(([, v]) => v.length > 0)) as Record<string, PanelFilter[]>
    : undefined;

  const payload: LayoutLabExportV1 = {
    version: 1,
    items,
    panelTypesById,
    ...(filteredPanelOptions && Object.keys(filteredPanelOptions).length > 0
      ? { panelOptionsById: filteredPanelOptions }
      : {}),
    ...(filteredPanelFilters && Object.keys(filteredPanelFilters).length > 0
      ? { panelFiltersById: filteredPanelFilters }
      : {}),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseLayoutLab(raw: string): LayoutLabExportV1 {
  const parsed = JSON.parse(raw) as Partial<LayoutLabExportV1>;
  if (parsed.version !== 1) {
    throw new Error("Unsupported layout version");
  }
  if (!Array.isArray(parsed.items) || !parsed.panelTypesById || typeof parsed.panelTypesById !== "object") {
    throw new Error("Invalid layout payload");
  }

  return {
    version: 1,
    items: parsed.items,
    panelTypesById: parsed.panelTypesById as Record<string, EventsPanelType>,
    panelOptionsById: parsed.panelOptionsById && typeof parsed.panelOptionsById === "object"
      ? parsed.panelOptionsById as Record<string, string>
      : undefined,
    panelFiltersById: parsed.panelFiltersById && typeof parsed.panelFiltersById === "object"
      ? parsed.panelFiltersById as Record<string, PanelFilter[]>
      : undefined,
  };
}

export function parsePanelLayout(layout: UserPanelLayout): LayoutLabExportV1 {
  try {
    return parseLayoutLab(JSON.stringify(layout.payload ?? {}));
  } catch {
    return {
      version: 1,
      items: DEFAULT_INSTANCE_LAYOUT_ITEMS,
      panelTypesById: DEFAULT_INSTANCE_PANEL_TYPES,
    };
  }
}
