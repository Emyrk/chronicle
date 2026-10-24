import { useCallback, useMemo, useState } from "react";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { LayoutAppearance } from "@/features/layoutBook/parseLayout";
import type { EventsPanelType } from "@/pages/Instance/EventsPanels";
import { PANELS } from "@/pages/Instance/EventsPanels/EventsPanel";
import type { PanelFilter } from "@/pages/Instance/EventsPanels/processors/filters";
import { STRIPS } from "@/pages/Instance/EventsPanels/Strips/strips";
import type { StripType } from "@/pages/Instance/EventsPanels/Strips/types";
import {
  addGroup,
  addPanel,
  addStrip,
  layoutPanelCount,
  mergePositions,
  moveIntoGroup,
  moveOutOfGroup,
  removeItem,
  setPanelFilters,
  setPanelOption,
  setPanelType,
  setStripType,
  updateItem,
  type LayoutDraft,
  type LayoutDraftCatalog,
} from "./layoutDraft";

export const LAYOUT_DRAFT_CATALOG: LayoutDraftCatalog = {
  panelLabel: (type) => PANELS[type as keyof typeof PANELS]?.label,
  panelDefaultFilters: (type) => PANELS[type as keyof typeof PANELS]?.defaultFilters,
  strip: (type) => STRIPS[type],
};

export interface LayoutDraftController {
  draft: LayoutDraft;
  /** Filters panels are (re)initialized from. Only changes on reset or a type change. */
  seedFiltersById: Record<string, PanelFilter[]>;
  seedFiltersVersion: number;
  panelCount: number;
  reset: (draft: LayoutDraft) => void;
  addPanel: () => string | null;
  addStrip: () => string | null;
  addGroup: () => string;
  removeItem: (itemId: string) => void;
  setPanelType: (itemId: string, type: EventsPanelType) => void;
  setStripType: (itemId: string, type: StripType) => void;
  setPanelOption: (itemId: string, option: string | null) => void;
  setPanelFilters: (itemId: string, filters: PanelFilter[]) => void;
  updateItem: (itemId: string, patch: Partial<GridEditorItem>) => void;
  setItems: (update: (items: GridEditorItem[]) => GridEditorItem[]) => void;
  mergePositions: (positioned: GridEditorItem[]) => void;
  moveIntoGroup: (itemId: string, groupId: string, desired: { x: number; y: number }) => void;
  moveOutOfGroup: (itemId: string) => void;
  setAppearance: (update: (appearance: LayoutAppearance) => LayoutAppearance) => void;
}

/** Shared state and actions for editing a layout (Layout Lab and instance Edit Mode). */
export function useLayoutDraft(initial: LayoutDraft | (() => LayoutDraft)): LayoutDraftController {
  const [draft, setDraft] = useState<LayoutDraft>(initial);
  const [seeds, setSeeds] = useState(() => ({
    byId: (typeof initial === "function" ? initial() : initial).panelFiltersById,
    version: 0,
  }));

  const reseed = useCallback((update: (byId: Record<string, PanelFilter[]>) => Record<string, PanelFilter[]>) => {
    setSeeds((previous) => ({ byId: update(previous.byId), version: previous.version + 1 }));
  }, []);

  const reset = useCallback((next: LayoutDraft) => {
    setDraft(next);
    reseed(() => next.panelFiltersById);
  }, [reseed]);

  // Add actions compute the id from the latest committed draft so callers
  // can announce or focus the new item.
  const addPanelAction = useCallback(() => {
    const result = addPanel(draft, LAYOUT_DRAFT_CATALOG);
    if (!result) return null;
    setDraft(result.draft);
    return result.id;
  }, [draft]);

  const addStripAction = useCallback(() => {
    const result = addStrip(draft, LAYOUT_DRAFT_CATALOG);
    if (!result) return null;
    setDraft(result.draft);
    return result.id;
  }, [draft]);

  const addGroupAction = useCallback(() => {
    const result = addGroup(draft);
    setDraft(result.draft);
    return result.id;
  }, [draft]);

  const setStripTypeAction = useCallback((itemId: string, type: StripType) => {
    setDraft((previous) => setStripType(previous, LAYOUT_DRAFT_CATALOG, itemId, type));
    const defaults = STRIPS[type].defaultFilters ?? [];
    reseed((byId) => ({ ...byId, [itemId]: defaults }));
  }, [reseed]);

  return {
    draft,
    seedFiltersById: seeds.byId,
    seedFiltersVersion: seeds.version,
    panelCount: useMemo(() => layoutPanelCount(draft), [draft]),
    reset,
    addPanel: addPanelAction,
    addStrip: addStripAction,
    addGroup: addGroupAction,
    removeItem: useCallback((itemId) => setDraft((previous) => removeItem(previous, itemId)), []),
    setPanelType: useCallback((itemId, type) => setDraft((previous) => setPanelType(previous, LAYOUT_DRAFT_CATALOG, itemId, type)), []),
    setStripType: setStripTypeAction,
    setPanelOption: useCallback((itemId, option) => setDraft((previous) => setPanelOption(previous, itemId, option)), []),
    setPanelFilters: useCallback((itemId, filters) => setDraft((previous) => setPanelFilters(previous, itemId, filters)), []),
    updateItem: useCallback((itemId, patch) => setDraft((previous) => updateItem(previous, itemId, patch)), []),
    setItems: useCallback((update) => setDraft((previous) => ({ ...previous, items: update(previous.items) })), []),
    mergePositions: useCallback((positioned) => setDraft((previous) => mergePositions(previous, positioned)), []),
    moveIntoGroup: useCallback((itemId, groupId, desired) => setDraft((previous) => moveIntoGroup(previous, itemId, groupId, desired)), []),
    moveOutOfGroup: useCallback((itemId) => setDraft((previous) => moveOutOfGroup(previous, itemId)), []),
    setAppearance: useCallback((update) => setDraft((previous) => ({ ...previous, appearance: update(previous.appearance) })), []),
  };
}
