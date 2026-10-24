import type { GridEditorItem, StripOrientation } from "@/components/layout/GridLayoutEditor";
import { placeLayoutItem } from "@/components/layout/layoutGroups";
import { readLayoutAppearance, serializeLayoutLab, type LayoutAppearance, type LayoutLabExportV1 } from "@/features/layoutBook/parseLayout";
import type { EventsPanelType } from "@/pages/Instance/EventsPanels";
import type { PanelFilter } from "@/pages/Instance/EventsPanels/processors/filters";
import { resolveStripSize, type StripSizeProfile, type StripType } from "@/pages/Instance/EventsPanels/Strips/types";

/**
 * An in-memory, id-keyed layout being edited. This is the same shape the
 * layout export/import JSON uses, so a draft can be applied to the instance
 * page or saved to the Layout Book without translation.
 */
export interface LayoutDraft {
  items: GridEditorItem[];
  panelTypesById: Record<string, EventsPanelType>;
  panelOptionsById: Record<string, string | null>;
  panelFiltersById: Record<string, PanelFilter[]>;
  appearance: LayoutAppearance;
}

/**
 * Panel and strip metadata the draft operations need. Injected so this module
 * stays free of the React panel registries (and testable in Node).
 */
export interface LayoutDraftCatalog {
  panelLabel: (type: EventsPanelType) => string | undefined;
  panelDefaultFilters: (type: EventsPanelType) => PanelFilter[] | undefined;
  strip: (type: StripType) => {
    label: string;
    defaultOrientation: StripOrientation;
    size: StripSizeProfile;
    defaultFilters?: PanelFilter[];
  };
}

export const MAX_LAYOUT_PANELS = 8;

/** Builds a draft from layout export JSON (Layout Book payloads, imports, exports). */
export function layoutDraftFromExport(layout: LayoutLabExportV1): LayoutDraft {
  return {
    items: layout.items,
    panelTypesById: layout.panelTypesById,
    panelOptionsById: Object.fromEntries(
      Object.entries(layout.panelOptionsById ?? {}).map(([itemId, value]) => [itemId, value ?? null]),
    ),
    panelFiltersById: layout.panelFiltersById ?? {},
    appearance: readLayoutAppearance(layout),
  };
}

/** Serializes a draft to the layout export JSON shape. */
export function layoutDraftToExport(draft: LayoutDraft): LayoutLabExportV1 {
  return JSON.parse(serializeLayoutLab(
    draft.items,
    draft.panelTypesById,
    draft.panelOptionsById,
    draft.panelFiltersById,
    draft.appearance,
  )) as LayoutLabExportV1;
}
export const DEFAULT_NEW_PANEL_TYPE: EventsPanelType = "damage_done";
export const DEFAULT_NEW_STRIP_TYPE: StripType = "raid_durability";

export function layoutPanelCount(draft: LayoutDraft): number {
  return draft.items.filter((item) => item.kind !== "group").length;
}

function nextItemId(items: readonly GridEditorItem[], prefix: string): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  const max = items.reduce((highest, item) => {
    const match = item.id.match(pattern);
    return Math.max(highest, match ? Number(match[1]) : 0);
  }, 0);
  return `${prefix}-${max + 1}`;
}

function bottomRow(items: readonly GridEditorItem[]): number {
  return items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

/** Appends a panel below everything else. Returns null at the panel limit. */
export function addPanel(
  draft: LayoutDraft,
  catalog: LayoutDraftCatalog,
  type: EventsPanelType = DEFAULT_NEW_PANEL_TYPE,
): { draft: LayoutDraft; id: string } | null {
  if (layoutPanelCount(draft) >= MAX_LAYOUT_PANELS) return null;
  const id = nextItemId(draft.items, "panel");
  return {
    id,
    draft: {
      ...draft,
      items: [...draft.items, {
        id,
        title: catalog.panelLabel(type) ?? type,
        x: 0,
        y: bottomRow(draft.items),
        w: 6,
        h: 4,
        minW: 4,
        minH: 4,
      }],
      panelTypesById: { ...draft.panelTypesById, [id]: type },
      panelOptionsById: { ...draft.panelOptionsById, [id]: null },
    },
  };
}

/** Appends a strip below everything else. Returns null at the panel limit. */
export function addStrip(
  draft: LayoutDraft,
  catalog: LayoutDraftCatalog,
  stripType: StripType = DEFAULT_NEW_STRIP_TYPE,
): { draft: LayoutDraft; id: string } | null {
  if (layoutPanelCount(draft) >= MAX_LAYOUT_PANELS) return null;
  const definition = catalog.strip(stripType);
  const orientation = definition.defaultOrientation;
  const size = resolveStripSize(definition.size, orientation);
  const id = nextItemId(draft.items, "strip");
  return {
    id,
    draft: {
      ...draft,
      items: [...draft.items, {
        id,
        kind: "strip",
        stripType,
        orientation,
        title: definition.label,
        x: 0,
        y: bottomRow(draft.items),
        w: size.preferredW,
        h: size.preferredH,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
      }],
    },
  };
}

/** Appends an empty full-width group row. */
export function addGroup(draft: LayoutDraft): { draft: LayoutDraft; id: string } {
  const id = nextItemId(draft.items, "group");
  return {
    id,
    draft: {
      ...draft,
      items: [...draft.items, {
        id,
        kind: "group",
        title: "Panels",
        description: "Drag panels and strips into this group.",
        x: 0,
        y: bottomRow(draft.items),
        w: 12,
        h: 4,
        minW: 12,
        maxW: 12,
        minH: 4,
        maxH: 4,
      }],
    },
  };
}

/** Removes an item. Removing a group moves its members to the bottom of the outer grid. */
export function removeItem(draft: LayoutDraft, itemId: string): LayoutDraft {
  const removed = draft.items.find((item) => item.id === itemId);
  if (!removed) return draft;
  const remaining = draft.items.filter((item) => item.id !== itemId);
  let items = remaining;
  if (removed.kind === "group") {
    let nextY = bottomRow(remaining.filter((item) => !item.groupId));
    items = remaining.map((item) => {
      if (item.groupId !== itemId) return item;
      const next = { ...item, groupId: undefined, x: 0, y: nextY };
      nextY += item.h;
      return next;
    });
  }
  return {
    ...draft,
    items,
    panelTypesById: withoutKey(draft.panelTypesById, itemId),
    panelOptionsById: withoutKey(draft.panelOptionsById, itemId),
    panelFiltersById: withoutKey(draft.panelFiltersById, itemId),
  };
}

/** Changes a panel's type, resetting its option and filters to the new type's defaults. */
export function setPanelType(
  draft: LayoutDraft,
  catalog: LayoutDraftCatalog,
  itemId: string,
  type: EventsPanelType,
): LayoutDraft {
  const defaults = catalog.panelDefaultFilters(type);
  return {
    ...draft,
    items: draft.items.map((item) =>
      item.id === itemId ? { ...item, title: catalog.panelLabel(type) ?? item.title } : item,
    ),
    panelTypesById: { ...draft.panelTypesById, [itemId]: type },
    panelOptionsById: { ...draft.panelOptionsById, [itemId]: null },
    panelFiltersById: defaults && defaults.length > 0
      ? { ...draft.panelFiltersById, [itemId]: defaults }
      : withoutKey(draft.panelFiltersById, itemId),
  };
}

/** Changes a strip's type, refitting its size constraints and resetting its filters. */
export function setStripType(
  draft: LayoutDraft,
  catalog: LayoutDraftCatalog,
  itemId: string,
  stripType: StripType,
): LayoutDraft {
  const definition = catalog.strip(stripType);
  return {
    ...draft,
    items: draft.items.map((item) => {
      if (item.id !== itemId || item.kind !== "strip") return item;
      const orientation = item.orientation ?? definition.defaultOrientation;
      const size = resolveStripSize(definition.size, orientation);
      return {
        ...item,
        title: definition.label,
        stripType,
        orientation,
        minW: size.minW,
        minH: size.minH,
        maxW: size.maxW,
        maxH: size.maxH,
        w: Math.max(item.w, size.minW),
        h: Math.max(item.h, size.minH),
      };
    }),
    panelFiltersById: { ...draft.panelFiltersById, [itemId]: definition.defaultFilters ?? [] },
  };
}

export function setPanelOption(draft: LayoutDraft, itemId: string, option: string | null): LayoutDraft {
  // Controlled panels may report their current option from an effect. Preserve
  // draft identity for an identical write so Edit Mode cannot enter a render loop.
  if ((draft.panelOptionsById[itemId] ?? null) === option) return draft;
  return { ...draft, panelOptionsById: { ...draft.panelOptionsById, [itemId]: option } };
}

export function setPanelFilters(draft: LayoutDraft, itemId: string, filters: PanelFilter[]): LayoutDraft {
  return {
    ...draft,
    panelFiltersById: filters.length === 0
      ? withoutKey(draft.panelFiltersById, itemId)
      : { ...draft.panelFiltersById, [itemId]: filters },
  };
}

/** Applies a partial update (title, color, …) to one item. */
export function updateItem(draft: LayoutDraft, itemId: string, patch: Partial<GridEditorItem>): LayoutDraft {
  return {
    ...draft,
    items: draft.items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
  };
}

/** Merges positions reported by a grid (which only sees one level of items). */
export function mergePositions(draft: LayoutDraft, positioned: readonly GridEditorItem[]): LayoutDraft {
  const byId = new Map(positioned.map((item) => [item.id, item]));
  return { ...draft, items: draft.items.map((item) => byId.get(item.id) ?? item) };
}

/** Moves a panel or strip into a group, placed as close to `desired` as fits. */
export function moveIntoGroup(
  draft: LayoutDraft,
  itemId: string,
  groupId: string,
  desired: { x: number; y: number },
): LayoutDraft {
  const item = draft.items.find((candidate) => candidate.id === itemId);
  if (!item || item.kind === "group") return draft;
  const position = placeLayoutItem(
    item,
    draft.items.filter((candidate) => candidate.groupId === groupId && candidate.id !== itemId),
    desired,
  );
  return updateItem(draft, itemId, { groupId, ...position });
}

/** Moves a grouped item back to the bottom of the outer grid. */
export function moveOutOfGroup(draft: LayoutDraft, itemId: string): LayoutDraft {
  const outer = draft.items.filter((candidate) => !candidate.groupId && candidate.id !== itemId);
  return updateItem(draft, itemId, { groupId: undefined, x: 0, y: bottomRow(outer) });
}
