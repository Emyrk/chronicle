import { useSyncExternalStore } from "react";
import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { LayoutType } from "@/hooks/useUrlState";
import type { EventsPanelType } from "@/pages/Instance/EventsPanels";
import {
  DEFAULT_INSTANCE_LAYOUT_ITEMS,
  DEFAULT_INSTANCE_PANEL_TYPES,
} from "@/pages/Instance/viewDefaults";

export const LAYOUT_ACTION_BAR_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;
export type LayoutActionBarKey = (typeof LAYOUT_ACTION_BAR_KEYS)[number];

export interface SavedLayout {
  id: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  layout: LayoutType;
  panels: EventsPanelType[];
  items: GridEditorItem[];
  createdAt: string;
  updatedAt: string;
}

export type LayoutActionBarSlots = Record<LayoutActionBarKey, string | null>;

interface LayoutBookState {
  layouts: SavedLayout[];
  actionBar: LayoutActionBarSlots;
}

function buildDefaultLayout(): SavedLayout {
  const orderedItems = [...DEFAULT_INSTANCE_LAYOUT_ITEMS].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.id.localeCompare(b.id);
  });

  return {
    id: crypto.randomUUID(),
    name: "Starter Layout",
    title: "Starter Layout",
    description: "A default layout to get started.",
    icon: "INV_Misc_Book_09",
    layout: "standard",
    panels: orderedItems.map((item) => DEFAULT_INSTANCE_PANEL_TYPES[item.id] ?? "empty"),
    items: orderedItems,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyActionBar(): LayoutActionBarSlots {
  return {
    "1": null,
    "2": null,
    "3": null,
    "4": null,
    "5": null,
    "6": null,
    "7": null,
    "8": null,
    "9": null,
    "0": null,
  };
}

let state: LayoutBookState = {
  layouts: [buildDefaultLayout()],
  actionBar: createEmptyActionBar(),
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function getSnapshot(): LayoutBookState {
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLayoutBookStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...snapshot,
    createLayout(input: Omit<SavedLayout, "id" | "createdAt" | "updatedAt" | "title" | "description" | "icon"> & Partial<Pick<SavedLayout, "title" | "description" | "icon">>) {
      const now = new Date().toISOString();
      const title = input.title?.trim() || input.name;
      const nextLayout: SavedLayout = {
        ...input,
        title,
        description: input.description ?? "",
        icon: input.icon ?? "INV_Misc_Book_09",
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      state = {
        ...state,
        layouts: [nextLayout, ...state.layouts],
      };
      emit();
      return nextLayout;
    },
    renameLayout(layoutID: string, name: string) {
      const next = name.trim();
      state = {
        ...state,
        layouts: state.layouts.map((layout) =>
          layout.id === layoutID
            ? { ...layout, name: next || layout.name, title: next || layout.title, updatedAt: new Date().toISOString() }
            : layout,
        ),
      };
      emit();
    },
    updateLayout(layoutID: string, update: Partial<Pick<SavedLayout, "name" | "title" | "description" | "icon" | "layout" | "items" | "panels">>) {
      state = {
        ...state,
        layouts: state.layouts.map((layout) => {
          if (layout.id !== layoutID) return layout;
          const nextTitle = update.title?.trim() || update.name?.trim() || layout.title || layout.name;
          const nextName = update.name?.trim() || nextTitle;
          return {
            ...layout,
            ...update,
            title: nextTitle,
            name: nextName,
            updatedAt: new Date().toISOString(),
          };
        }),
      };
      emit();
    },
    deleteLayout(layoutID: string) {
      state = {
        layouts: state.layouts.filter((layout) => layout.id !== layoutID),
        actionBar: Object.fromEntries(
          Object.entries(state.actionBar).map(([key, mappedLayoutID]) => [key, mappedLayoutID === layoutID ? null : mappedLayoutID]),
        ) as LayoutActionBarSlots,
      };
      emit();
    },
    assignActionBarSlot(key: LayoutActionBarKey, layoutID: string | null) {
      state = {
        ...state,
        actionBar: {
          ...state.actionBar,
          [key]: layoutID,
        },
      };
      emit();
    },
  };
}
