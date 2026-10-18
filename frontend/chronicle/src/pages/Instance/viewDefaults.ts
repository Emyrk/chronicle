import type { GridEditorItem } from "@/components/layout/GridLayoutEditor";
import type { EventsPanelType } from "./EventsPanels";
import type { PanelFilter } from "./EventsPanels/processors/filters";

// ── Desktop defaults ─────────────────────────────────────────────────────────

export const DEFAULT_INSTANCE_LAYOUT_ITEMS: GridEditorItem[] = [
  { id: "panel-1", title: "Line Chart", x: 0, y: 0, w: 12, h: 4, minW: 4 },
  { id: "panel-2", title: "Damage Done", x: 0, y: 4, w: 6, h: 5, minW: 4 },
  { id: "panel-3", title: "Healing Done", x: 6, y: 4, w: 6, h: 5, minW: 4 },
  { id: "panel-4", title: "Damage Taken", x: 0, y: 9, w: 6, h: 5, minW: 4 },
  { id: "panel-5", title: "Enemy Damage", x: 6, y: 9, w: 6, h: 5, minW: 4 },
];

export const DEFAULT_INSTANCE_PANEL_TYPES: Record<string, EventsPanelType> = {
  "panel-1": "timeline",
  "panel-2": "damage_done",
  "panel-3": "healing_done",
  "panel-4": "damage_taken",
  "panel-5": "enemy_damage_done",
  "panel-6": "periods",
};

export const DEFAULT_INSTANCE_PANEL_OPTIONS: Record<string, string> = {
  "panel-1": "bc:#3b82f6,t:RollingAverages,tl:eyJzZXJpZXMiOlt7ImlkIjoiczAiLCJuYW1lIjoiRGFtYWdlIERvbmUiLCJzdHJlYW0iOiJkYW1hZ2UiLCJhZ2dyZWdhdGlvbiI6InJvbGxpbmdfYXZnIiwiY29sb3IiOiIjMDA3MERFIiwiZmlsdGVycyI6W3sidHlwZSI6InNvdXJjZV90eXBlIiwidmFsdWUiOlsicGV0IiwicGxheWVyIl0sImFwcGx5VG8iOlsiZGFtYWdlIl19LHsidHlwZSI6InRhcmdldF90eXBlIiwidmFsdWUiOlsiZW5lbXlfcGV0IiwiZW5lbXkiXSwiY29tYmluYXRvciI6ImFuZCIsImFwcGx5VG8iOlsiZGFtYWdlIl19XX0seyJpZCI6InMxIiwibmFtZSI6IkhlYWxpbmciLCJzdHJlYW0iOiJoZWFsIiwiYWdncmVnYXRpb24iOiJyb2xsaW5nX2F2ZyIsImNvbG9yIjoiI0FCRDQ3MyIsImZpbHRlcnMiOlt7InR5cGUiOiJzb3VyY2VfdHlwZSIsInZhbHVlIjpbInBldCIsInBsYXllciJdLCJhcHBseVRvIjpbImhlYWwiXX0seyJ0eXBlIjoidGFyZ2V0X3R5cGUiLCJ2YWx1ZSI6WyJwbGF5ZXIiLCJwZXQiXSwiY29tYmluYXRvciI6ImFuZCIsImFwcGx5VG8iOlsiaGVhbCJdfV19LHsiaWQiOiJzMiIsIm5hbWUiOiJEYW1hZ2UgVGFrZW4iLCJzdHJlYW0iOiJkYW1hZ2UiLCJhZ2dyZWdhdGlvbiI6InJvbGxpbmdfYXZnIiwiY29sb3IiOiIjQzQxRjNCIiwiZmlsdGVycyI6W3sidHlwZSI6InNvdXJjZV90eXBlIiwidmFsdWUiOlsiZW5lbXkiLCJlbmVteV9wZXQiXX0seyJ0eXBlIjoidGFyZ2V0X3R5cGUiLCJ2YWx1ZSI6WyJwbGF5ZXIiLCJwZXQiXSwiY29tYmluYXRvciI6ImFuZCJ9XX0seyJpZCI6InMzIiwibmFtZSI6IkVmZmVjdGl2ZSBIZWFsaW5nIiwic3RyZWFtIjoiZWZmZWN0aXZlX2hlYWwiLCJhZ2dyZWdhdGlvbiI6InJvbGxpbmdfYXZnIiwiY29sb3IiOiIjZDhmMGI3IiwiZmlsdGVycyI6W3sidHlwZSI6InNvdXJjZV90eXBlIiwidmFsdWUiOlsicGxheWVyIiwicGV0Il19LHsidHlwZSI6InRhcmdldF90eXBlIiwidmFsdWUiOlsicGV0IiwicGxheWVyIl0sImNvbWJpbmF0b3IiOiJhbmQifV19XSwic2V0dGluZ3MiOnsiYmluTXMiOjUwMCwiaGlkZGVuU2VyaWVzIjpbInMxIl0sImJhY2tncm91bmQiOiJyYWlkX2R1cmFiaWxpdHkiLCJhbm5vdGF0aW9ucyI6WyJwbGF5ZXJfZGVhdGhzIl19fQ==",
  "panel-2": "g:merged,p:owner",
  "panel-3": "g:merged,p:owner",
  "panel-4": "g:default,p:individual",
  "panel-5": "g:merged,p:owner",
};

export const DEFAULT_INSTANCE_PANEL_FILTERS: Record<string, PanelFilter[]> = {
  "panel-2": [
    { type: "time_range", value: "controller", applyTo: ["damage"] },
    { type: "target_type", value: "selected_enemies", applyTo: ["damage"] },
  ],
  "panel-3": [
    { type: "time_range", value: "controller", applyTo: ["heal", "absorbed"] },
    { type: "target_type", value: "selected_players", applyTo: ["heal", "absorbed"] },
  ],
  "panel-4": [
    { type: "time_range", value: "controller", applyTo: ["damage"] },
    { type: "source_type", value: "selected_enemies", applyTo: ["damage"] },
  ],
  "panel-5": [
    { type: "time_range", value: "controller", applyTo: ["damage"] },
    { type: "target_type", value: "selected_players", applyTo: ["damage"] },
  ],
};

// ── Position-log defaults ────────────────────────────────────────────────────
// Logs with unit positions get a mini replay map beside the timeline.

/** The Map panel option that draws it as a mini map (no overlays, an Expand button). */
export const MINI_MAP_PANEL_OPTION = "mini";

export const POSITION_SUMMARY_CAPABILITY = "unit-position";

export const POSITION_SUMMARY_LAYOUT_ITEMS: GridEditorItem[] = [
  { id: "panel-1", title: "Line Chart", x: 0, y: 0, w: 8, h: 4, minW: 4 },
  { id: "panel-6", title: "Map", x: 8, y: 0, w: 4, h: 4, minW: 3 },
  ...DEFAULT_INSTANCE_LAYOUT_ITEMS.filter((item) => item.id !== "panel-1"),
];

export const POSITION_SUMMARY_PANEL_TYPES: Record<string, EventsPanelType> = {
  ...DEFAULT_INSTANCE_PANEL_TYPES,
  "panel-6": "map",
};

/** The built-in default layout for a log: the position summary when the log has positions (desktop only). */
export function defaultInstanceLayout(capabilities: readonly string[], mobile = false) {
  const positions = !mobile && capabilities.includes(POSITION_SUMMARY_CAPABILITY);
  return {
    items: positions ? POSITION_SUMMARY_LAYOUT_ITEMS : DEFAULT_INSTANCE_LAYOUT_ITEMS,
    panelTypes: positions ? POSITION_SUMMARY_PANEL_TYPES : DEFAULT_INSTANCE_PANEL_TYPES,
    panelOptions: positions
      ? { ...DEFAULT_INSTANCE_PANEL_OPTIONS, "panel-6": MINI_MAP_PANEL_OPTION }
      : DEFAULT_INSTANCE_PANEL_OPTIONS,
  };
}

// ── Mobile defaults ──────────────────────────────────────────────────────────


// ── Alternate layout ─────────────────────────────────────────────────────────

export const ALTERNATE_INSTANCE_LAYOUT_ITEMS: GridEditorItem[] = [
  { id: "panel-1", title: "Damage Done", x: 0, y: 0, w: 6, h: 5, minW: 4 },
  { id: "panel-2", title: "Healing Done", x: 6, y: 0, w: 6, h: 5, minW: 4 },
  { id: "panel-5", title: "All Activity", x: 0, y: 5, w: 12, h: 5, minW: 4 },
  { id: "panel-6", title: "Periods", x: 0, y: 10, w: 12, h: 5, minW: 4 },
];
